import {
  NotificationStatus,
  NotificationType,
} from '../generated/prisma/enums.js';

export interface NotificationCreatedMessage {
  notificationId: string;
  userId: string;
  type: NotificationType;
  recipient: string;
  subject: string | null;
  message: string;
  status: NotificationStatus;
  createdAt: string;
}
