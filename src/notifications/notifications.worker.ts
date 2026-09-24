import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service.js';
import { NotificationCreateMessage } from './notification.message.js';
import type { NotificationProvider } from './providers/notification-provider.interface.js';
import { NOTIFICATION_PROVIDER } from './providers/notification-provider.interface.js';

@Injectable()
export class NotificationsWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationsWorker.name);

  constructor(
    private readonly rabbitMQ: RabbitMQService,
    private readonly prisma: PrismaService,

    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificationProvider: NotificationProvider,
  ) {}

  async onModuleInit() {
    await this.rabbitMQ.consume(async (message) => {
      await this.process(message);
    });
  }

  private async process(message: ConsumeMessage): Promise<void> {
    const payload = JSON.parse(
      message.content.toString(),
    ) as NotificationCreateMessage;

    this.logger.log(`Processing notification ${payload.notificationId}`);

    await this.prisma.notification.update({
      where: {
        id: payload.notificationId,
      },
      data: {
        status: 'PROCESSING',
        attempts: {
          increment: 1,
        },
      },
    });

    if (payload.type === 'EMAIL') {
      await this.notificationProvider.send({
        recipient: payload.recipient,
        subject: payload.subject,
        message: payload.message,
      });
    }

    await this.prisma.notification.update({
      where: { id: payload.notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    this.logger.log(`Notification ${payload.notificationId} sent successfully`);
  }
}
