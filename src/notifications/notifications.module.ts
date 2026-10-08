import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module.js';
import { NotificationRateLimitGuard } from './notification-rate-limit.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsWorker } from './notifications.worker.js';
import { NodemailerEmailProvider } from './providers/nodemailer-email.provider.js';
import { NOTIFICATION_PROVIDER } from './providers/notification-provider.interface.js';

@Module({
  imports: [MetricsModule],
  providers: [
    NotificationsService,
    NotificationsWorker,
    NodemailerEmailProvider,
    NotificationRateLimitGuard,
    {
      provide: NOTIFICATION_PROVIDER,
      useExisting: NodemailerEmailProvider,
    },
  ],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
