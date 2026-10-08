import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { OutboxEvent, OutboxStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);

  private readonly publisherId = `${hostname()}-${process.pid}-${randomUUID()}`;
  private readonly batchSize = 20;
  private readonly leaseSeconds = 30;
  private timer?: NodeJS.Timeout;
  private isPublishing = false;
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQ: RabbitMQService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(`Outbox publisher started: ${this.publisherId}`);

    await this.publishPendingEvents();

    this.timer = setInterval(() => {
      void this.publishPendingEvents();
    }, 1000);
  }

  private async publishPendingEvents(): Promise<void> {
    if (this.shuttingDown || this.isPublishing) {
      return;
    }

    this.isPublishing = true;

    try {
      const events = await this.claimPendingEvents();

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Claimed ${events.length} outbox event(s)`);

      for (const event of events) {
        await this.publishEvent(event);
      }
    } catch (error) {
      this.logger.error(
        `Outbox publishing failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isPublishing = false;
    }
  }

  /**
   * Atomically claims a batch of events.
   *
   * FOR UPDATE SKIP LOCKED means:
   *
   * Publisher A locks row 1
   * Publisher B skips row 1
   * Publisher B can process row 2
   */
  private async claimPendingEvents(): Promise<OutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<OutboxEvent[]>`
            SELECT *
            FROM "OutboxEvent"
            WHERE
              "status" = 'PENDING'
              OR (
                "status" = 'CLAIMED'
                AND "claimedAt" <
                  NOW() -
                  (${this.leaseSeconds} * INTERVAL '1 second')
              )
            ORDER BY "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${this.batchSize}
          `;

      if (events.length === 0) {
        return [];
      }

      const eventIds = events.map((event) => event.id);

      await tx.outboxEvent.updateMany({
        where: {
          id: {
            in: eventIds,
          },
        },
        data: {
          status: OutboxStatus.CLAIMED,
          claimedAt: new Date(),
          claimedBy: this.publisherId,
          attempts: {
            increment: 1,
          },
        },
      });

      return events.map((event) => ({
        ...event,
        status: OutboxStatus.CLAIMED,
        claimedAt: new Date(),
        claimedBy: this.publisherId,
      }));
    });
  }

  private async publishEvent(event: OutboxEvent): Promise<void> {
    try {
      await this.rabbitMQ.publish(event.payload as any);

      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: OutboxStatus.CLAIMED,
          claimedBy: this.publisherId,
        },
        data: {
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          claimedAt: null,
          claimedBy: null,
        },
      });

      this.logger.debug(`Outbox event published: ${event.id}`);
    } catch (error) {
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: OutboxStatus.CLAIMED,
          claimedBy: this.publisherId,
        },
        data: {
          status: OutboxStatus.PENDING,
          lastError: error instanceof Error ? error.message : String(error),
          claimedAt: null,
          claimedBy: null,
        },
      });

      this.logger.error(
        `Failed to publish outbox event ${event.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.logger.log('Outbox publisher stopped gracefully');
  }
}
