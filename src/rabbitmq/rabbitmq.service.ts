import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MetricsService } from '../metrics/metrics.service.js';
import { NotificationCreatedMessage } from '../notifications/notification.message.js';
import {
  DLQ_QUEUE,
  DLQ_ROUTING_KEY,
  RABBITMQ_EXCHANGE,
  RABBITMQ_QUEUE,
  RABBITMQ_ROUTING_KEY,
  RETRY_1_QUEUE,
  RETRY_1_ROUTING_KEY,
  RETRY_2_QUEUE,
  RETRY_2_ROUTING_KEY,
  RETRY_3_QUEUE,
  RETRY_3_ROUTING_KEY,
} from './rabbitmq.constants.js';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;

  private consumerHandler?: (
    message: NotificationCreatedMessage,
  ) => Promise<void>;

  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    try {
      await this.channel?.close();
    } catch {
      // Ignore channel close errors during shutdown
    }

    try {
      await this.connection?.close();
    } catch {
      // Ignore connection close errors during shutdown
    }

    this.channel = undefined;
    this.connection = undefined;

    this.logger.log('RabbitMQ connection closed gracefully');
  }

  private getChannel(): amqp.ConfirmChannel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    return this.channel;
  }

  async publish(message: unknown): Promise<void> {
    const channel = this.getChannel();

    channel.publish(
      RABBITMQ_EXCHANGE,
      RABBITMQ_ROUTING_KEY,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json' },
    );

    await channel.waitForConfirms();

    this.metrics.rabbitmqPublishedTotal.inc({
      routing_key: RABBITMQ_ROUTING_KEY,
    });
  }

  async publishToRetry(retryQueue: string, message: unknown): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const published = this.channel.sendToQueue(
      retryQueue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json' },
    );

    if (!published) {
      this.logger.warn(
        `RabbitMQ backpressure detected while publishing to ${retryQueue}`,
      );
    }

    await this.channel.waitForConfirms();
  }

  async publishToDLQ(message: unknown): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const published = this.channel.publish(
      RABBITMQ_EXCHANGE,
      DLQ_ROUTING_KEY,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
      },
    );

    if (!published) {
      this.logger.warn(
        'RabbitMQ backpressure detected while publishing to DLQ',
      );
    }

    await this.channel.waitForConfirms();
  }

  async consume(
    handler: (message: NotificationCreatedMessage) => Promise<void>,
  ): Promise<void> {
    this.consumerHandler = handler;

    await this.startConsumer();
  }

  private async startConsumer(): Promise<void> {
    const channel = this.channel;

    if (!channel || !this.consumerHandler) {
      return;
    }

    await channel.prefetch(10);

    await channel.consume(
      RABBITMQ_QUEUE,
      async (message: amqp.ConsumeMessage | null) => {
        if (!message) {
          return;
        }

        try {
          const payload = JSON.parse(
            message.content.toString(),
          ) as NotificationCreatedMessage;

          await this.consumerHandler!(payload);

          this.settle(channel, () => channel.ack(message));
        } catch (error) {
          this.logger.error(
            `RabbitMQ message processing failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );

          this.settle(channel, () => channel.nack(message, false, false));
        }
      },
    );

    this.logger.log(`RabbitMQ consumer started: ${RABBITMQ_QUEUE}`);
  }

  private settle(channel: amqp.ConfirmChannel, action: () => void): void {
    if (this.channel !== channel) {
      return;
    }

    try {
      action();
    } catch (error) {
      this.logger.warn(
        `RabbitMQ ack/nack failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    let connection: amqp.ChannelModel | undefined;

    try {
      this.logger.log('Connecting to RabbitMQ...');

      const url = this.configService.getOrThrow<string>('RABBITMQ_URL');

      connection = await amqp.connect(url);
      this.connection = connection;
      this.attachConnectionListeners(connection);

      const channel = await connection.createConfirmChannel();
      this.channel = channel;
      this.attachChannelListeners(connection, channel);

      await this.setupTopology(channel);

      this.reconnectAttempts = 0;

      this.logger.log('RabbitMQ connected');

      if (this.consumerHandler) {
        await this.startConsumer();
      }
    } catch (error) {
      this.logger.error(
        `RabbitMQ connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (this.connection === connection) {
        this.channel = undefined;
        this.connection = undefined;
      }

      await connection?.close().catch(() => undefined);

      this.isConnecting = false;
      this.scheduleReconnect();

      return;
    }

    this.isConnecting = false;

    if (this.shuttingDown) {
      await this.onModuleDestroy();
    }
  }

  private attachConnectionListeners(connection: amqp.ChannelModel): void {
    connection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${error.message}`);
    });

    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');

      // Ignore events from a connection that was already replaced.
      if (this.connection !== connection) {
        return;
      }

      this.channel = undefined;
      this.connection = undefined;

      this.scheduleReconnect();
    });
  }

  private attachChannelListeners(
    connection: amqp.ChannelModel,
    channel: amqp.ConfirmChannel,
  ): void {
    channel.on('error', (error) => {
      this.logger.error(`RabbitMQ channel error: ${error.message}`);
    });

    channel.on('close', () => {
      this.logger.warn('RabbitMQ channel closed');

      if (this.shuttingDown || this.channel !== channel) {
        return;
      }

      // A lone channel closure leaves the consumer dead; closing the
      // connection triggers the full reconnect path.
      this.channel = undefined;
      void connection.close().catch(() => undefined);
    });
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer || this.isConnecting) {
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);

    this.reconnectAttempts++;

    this.logger.warn(`RabbitMQ reconnect scheduled in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;

      void this.connect();
    }, delay);
  }

  private async setupTopology(channel: amqp.ConfirmChannel): Promise<void> {
    // Exchange
    await channel.assertExchange(RABBITMQ_EXCHANGE, 'direct', {
      durable: true,
    });

    // Queues
    await channel.assertQueue(RABBITMQ_QUEUE, { durable: true });

    await this.assertRetryQueue(channel, RETRY_1_QUEUE, 1000);
    await this.assertRetryQueue(channel, RETRY_2_QUEUE, 2000);
    await this.assertRetryQueue(channel, RETRY_3_QUEUE, 4000);

    await channel.assertQueue(DLQ_QUEUE, { durable: true });

    // Bindings
    await channel.bindQueue(
      RABBITMQ_QUEUE,
      RABBITMQ_EXCHANGE,
      RABBITMQ_ROUTING_KEY,
    );
    await channel.bindQueue(
      RETRY_1_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_1_ROUTING_KEY,
    );
    await channel.bindQueue(
      RETRY_2_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_2_ROUTING_KEY,
    );
    await channel.bindQueue(
      RETRY_3_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_3_ROUTING_KEY,
    );
    await channel.bindQueue(DLQ_QUEUE, RABBITMQ_EXCHANGE, DLQ_ROUTING_KEY);
  }

  // Expired messages are dead-lettered back to the main queue
  private async assertRetryQueue(
    channel: amqp.ConfirmChannel,
    queue: string,
    ttl: number,
  ): Promise<void> {
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-message-ttl': ttl,
        'x-dead-letter-exchange': RABBITMQ_EXCHANGE,
        'x-dead-letter-routing-key': RABBITMQ_ROUTING_KEY,
      },
    });
  }
}
