import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsWorker } from './notifications.worker.js';
import { FakeEmailProvider } from './providers/fake-email.provider.js';
import { NOTIFICATION_PROVIDER } from './providers/notification-provider.interface.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsWorker,
    FakeEmailProvider,

    {
      provide: NOTIFICATION_PROVIDER,
      useExisting: FakeEmailProvider,
    },
  ],
})
export class NotificationsModule {}
