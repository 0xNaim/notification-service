import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  NotificationStatus,
  NotificationType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateNotificationDto) {
    if (dto.idempotencyKey) {
      const redisKey = `notification:idempotency:${dto.idempotencyKey}`;

      const cachedNotificationId = await this.redis.getClient().get(redisKey);

      if (cachedNotificationId) {
        const notification = await this.prisma.notification.findUnique({
          where: { id: cachedNotificationId },
        });

        if (notification) {
          return notification;
        }

        await this.redis.getClient().del(redisKey);
      }

      const existing = await this.prisma.notification.findUnique({
        where: {
          idempotencyKey: dto.idempotencyKey,
        },
      });

      if (existing) {
        await this.redis
          .getClient()
          .set(redisKey, existing.id, 'EX', 60 * 60 * 24);

        return existing;
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            userId: dto.userId,
            type: dto.type as NotificationType,
            recipient: dto.recipient,
            subject: dto.subject,
            message: dto.message,
            idempotencyKey: dto.idempotencyKey,
            status: NotificationStatus.PENDING,
          },
        });

        if (result && result.idempotencyKey) {
          const redisKey = `notification:idempotency:${result.idempotencyKey}`;

          await this.redis
            .getClient()
            .set(redisKey, result.id, 'EX', 60 * 60 * 24);
        }

        await tx.outboxEvent.create({
          data: {
            eventType: 'notification.created',
            aggregateId: notification.id,
            payload: {
              notificationId: notification.id,
              userId: notification.userId,
              type: notification.type,
              recipient: notification.recipient,
              subject: notification.subject,
              message: notification.message,
              status: notification.status,
              createdAt: notification.createdAt.toISOString(),
            },
          },
        });

        return notification;
      });

      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        dto.idempotencyKey &&
        error.code === 'P2002'
      ) {
        const existingNotification = await this.prisma.notification.findUnique({
          where: {
            idempotencyKey: dto.idempotencyKey,
          },
        });

        if (existingNotification) {
          return existingNotification;
        }
      }

      throw error;
    }
  }

  async findById(id: string) {
    return this.prisma.notification.findUnique({
      where: { id },
    });
  }
}
