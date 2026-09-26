import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMQService } from './rabbitmq.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);

  private timer?: NodeJS.Timeout;
  private isPublishing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQ: RabbitMQService,
  ) {}

  async onModuleInit() {
    await this.publishPendingEvents();

    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 1000);
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async publishPendingEvents() {
    if (this.isPublishing) {
      return;
    }

    this.isPublishing = true;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 10,
      });

      for (const event of events) {
        await this.publishEvent(event);
      }
    } catch (error) {
      this.logger.error(
        'Outbox polling failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async publishEvent(event: {
    id: string;
    payload: unknown;
    attempts: number;
  }): Promise<void> {
    try {
      await this.rabbitMQ.publish(event.payload);

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      });

      this.logger.log(`Outbox event ${event.id} published`);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown outbox publishing error';

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: {
            increment: 1,
          },
          lastError: errorMessage,
        },
      });

      this.logger.error(
        `Failed to publish outbox event ${event.id}: ${errorMessage}`,
      );
    }
  }
}
