export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export interface NotificationProvider {
  send(params: {
    recipient: string;
    subject?: string | null;
    message: string;
  }): Promise<void>;
}
