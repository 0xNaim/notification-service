import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
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

  private connection: amqp.ChannelModel;
  private channel: amqp.Channel;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
    await this.setupTopology();
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(message: unknown): Promise<void> {
    const payload = Buffer.from(JSON.stringify(message));

    const published = this.channel.publish(
      RABBITMQ_EXCHANGE,
      RABBITMQ_ROUTING_KEY,
      payload,
      { persistent: true, contentType: 'application/json' },
    );

    if (!published) {
      this.logger.warn('RabbitMQ write buffer is full');
    }
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
  }

  async consume(
    handler: (message: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    await this.channel.prefetch(10);

    await this.channel.consume(RABBITMQ_QUEUE, async (message) => {
      if (!message) {
        return;
      }

      try {
        await handler(message);

        this.channel.ack(message);
      } catch (error) {
        this.logger.error('Failed to process RabbitMQ message', error);

        this.channel.nack(message, false, false);
      }
    });

    this.logger.log(`Consuming from ${RABBITMQ_QUEUE}`);
  }

  private async connect(): Promise<void> {
    const url = this.configService.getOrThrow<string>('RABBITMQ_URL');

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    this.logger.log('RabbitMQ connected');
  }

  private async setupTopology(): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    // Exchange
    await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'direct', {
      durable: true,
    });

    // Queues
    await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });

    await this.assertRetryQueue(RETRY_1_QUEUE, 1000);
    await this.assertRetryQueue(RETRY_2_QUEUE, 2000);
    await this.assertRetryQueue(RETRY_3_QUEUE, 4000);

    await this.channel.assertQueue(DLQ_QUEUE, { durable: true });

    // Bindings
    await this.channel.bindQueue(
      RABBITMQ_QUEUE,
      RABBITMQ_EXCHANGE,
      RABBITMQ_ROUTING_KEY,
    );
    await this.channel.bindQueue(
      RETRY_1_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_1_ROUTING_KEY,
    );
    await this.channel.bindQueue(
      RETRY_2_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_2_ROUTING_KEY,
    );
    await this.channel.bindQueue(
      RETRY_3_QUEUE,
      RABBITMQ_EXCHANGE,
      RETRY_3_ROUTING_KEY,
    );
    await this.channel.bindQueue(DLQ_QUEUE, RABBITMQ_EXCHANGE, DLQ_ROUTING_KEY);
  }

  // Expired messages are dead-lettered back to the main queue
  private async assertRetryQueue(queue: string, ttl: number): Promise<void> {
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-message-ttl': ttl,
        'x-dead-letter-exchange': RABBITMQ_EXCHANGE,
        'x-dead-letter-routing-key': RABBITMQ_ROUTING_KEY,
      },
    });
  }
}
