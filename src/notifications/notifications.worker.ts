import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { MetricsService } from '../metrics/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RETRY_1_QUEUE,
  RETRY_2_QUEUE,
  RETRY_3_QUEUE,
} from '../rabbitmq/rabbitmq.constants.js';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { NotificationProvider } from './providers/notification-provider.interface.js';
import { NOTIFICATION_PROVIDER } from './providers/notification-provider.interface.js';

interface NotificationCreatedMessage {
  notificationId: string;
  type: string;
  recipient: string;
  subject: string;
  message: string;
}

@Injectable()
export class NotificationsWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQ: RabbitMQService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,

    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificationProvider: NotificationProvider,
  ) {}

  async onModuleInit() {
    await this.rabbitMQ.consume(async (message: ConsumeMessage) => {
      const payload = JSON.parse(
        message.content.toString(),
      ) as NotificationCreatedMessage;

      await this.processMessage(payload);
    });
  }

  private async processMessage(
    payload: NotificationCreatedMessage,
  ): Promise<void> {
    this.metrics.rabbitmqConsumedTotal.inc({
      queue: 'notification.queue',
    });

    const startedAt = process.hrtime.bigint();

    this.logger.log(`Processing notification ${payload.notificationId}`);

    const lockKey = `notification:processing:${payload.notificationId}`;

    // Try to acquire a short-lived distributed lock.
    const lockAcquired = await this.redis.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      this.logger.warn(
        `Notification ${payload.notificationId} is already being processed`,
      );

      return;
    }

    try {
      // Atomically claim the notification. Only PENDING notifications can be claimed.
      const claimed = await this.prisma.notification.updateMany({
        where: {
          id: payload.notificationId,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          attempts: {
            increment: 1,
          },
        },
      });

      if (claimed.count === 0) {
        this.logger.warn(
          `Notification ${payload.notificationId} was already processed or is not pending`,
        );

        return;
      }

      try {
        await this.notificationProvider.send({
          recipient: payload.recipient,
          subject: payload.subject,
          message: payload.message,
        });

        await this.prisma.notification.update({
          where: {
            id: payload.notificationId,
          },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            lastError: null,
          },
        });

        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

        this.metrics.notificationsSentTotal.inc({
          type: payload.type,
        });

        this.metrics.notificationProcessingDuration.observe(
          {
            type: payload.type,
          },
          durationSeconds,
        );

        this.logger.log(
          `Notification ${payload.notificationId} sent successfully`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown notification provider error';

        this.metrics.notificationsFailedTotal.inc({
          type: payload.type,
        });

        await this.prisma.notification.update({
          where: {
            id: payload.notificationId,
          },
          data: {
            status: 'PROCESSING',
            lastError: errorMessage,
          },
        });

        this.logger.error(
          `Notification ${payload.notificationId} failed: ${errorMessage}`,
        );

        await this.handleRetry(payload);
      }
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  private async handleRetry(
    payload: NotificationCreatedMessage,
  ): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: {
        id: payload.notificationId,
      },
    });

    if (!notification) {
      throw new Error(`Notification ${payload.notificationId} not found`);
    }

    const attempt = notification.attempts;

    this.metrics.notificationRetriesTotal.inc({
      attempt: String(attempt),
    });

    if (attempt > 3) {
      await this.prisma.notification.update({
        where: {
          id: payload.notificationId,
        },
        data: {
          status: 'FAILED',
        },
      });

      await this.rabbitMQ.publishToDLQ(payload);

      this.metrics.notificationDlqTotal.inc();

      this.logger.error(`Notification ${payload.notificationId} moved to DLQ`);

      return;
    }

    // Make it claimable again when it returns from the retry queue.
    await this.prisma.notification.update({
      where: {
        id: payload.notificationId,
      },
      data: {
        status: 'PENDING',
      },
    });

    if (attempt === 1) {
      await this.rabbitMQ.publishToRetry(RETRY_1_QUEUE, payload);

      return;
    }

    if (attempt === 2) {
      await this.rabbitMQ.publishToRetry(RETRY_2_QUEUE, payload);

      return;
    }

    await this.rabbitMQ.publishToRetry(RETRY_3_QUEUE, payload);
  }
}
