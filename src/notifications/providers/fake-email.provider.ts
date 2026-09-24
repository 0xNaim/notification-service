import { Injectable, Logger } from '@nestjs/common';
import { NotificationProvider } from './notification-provider.interface.js';

@Injectable()
export class FakeEmailProvider implements NotificationProvider {
  private readonly logger = new Logger(FakeEmailProvider.name);

  async send(params: {
    recipient: string;
    subject?: string | null;
    message: string;
  }): Promise<void> {
    this.logger.log(`Sending email to ${params.recipient}`);

    this.logger.log(`Subject: ${params.subject ?? '(no subject)'}`);

    this.logger.log(`Message: ${params.message}`);

    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Email sent to ${params.recipient}`);
  }
}
