import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMQService } from './rabbitmq.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQ: RabbitMQService,
  ) {}

  async onModuleInit() {
    this.start();
  }

  private start() {
    setInterval(() => {
      void this.publishPendingEvents();
    }, 1000);
  }

  private async publishPendingEvents() {
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
      try {
        await this.rabbitMQ.publish(event.payload);

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      } catch (error) {
        await this.prisma.outboxEvent.update({
          where: {
            id: event.id,
          },
          data: {
            status: 'FAILED',
            attempts: {
              increment: 1,
            },
            lastError: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        this.logger.error(`Failed to publish outbox event ${event.id}`);
      }
    }
  }
}
