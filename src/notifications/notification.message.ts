import {
  NotificationStatus,
  NotificationType,
} from '../generated/prisma/enums.js';

export interface NotificationCreateMessage {
  notificationId: string;
  userId: string;
  type: NotificationType;
  recipient: string;
  subject: string | null;
  message: string;
  status: NotificationStatus;
  createdAt: string;
}
