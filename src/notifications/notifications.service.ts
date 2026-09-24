import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  NotificationStatus,
  NotificationType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQ: RabbitMQService,
  ) {}

  async create(dto: CreateNotificationDto) {
    const existing = dto.idempotencyKey
      ? await this.prisma.notification.findUnique({
          where: {
            idempotencyKey: dto.idempotencyKey,
          },
        })
      : null;

    if (existing) {
      return existing;
    }

    try {
      const notification = await this.prisma.notification.create({
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

      await this.rabbitMQ.publish({
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        recipient: notification.recipient,
        subject: notification.subject,
        message: notification.message,
        status: notification.status,
        createdAt: notification.createdAt.toISOString(),
      });

      return notification;
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
