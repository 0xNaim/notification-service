import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { NotificationProvider } from './notification-provider.interface.js';

@Injectable()
export class NodemailerEmailProvider
  implements NotificationProvider, OnModuleInit
{
  private readonly logger = new Logger(NodemailerEmailProvider.name);

  private transporter?: Transporter;
  private from?: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // Only the worker sends emails; the API process does not need SMTP.
    if (this.configService.get<string>('PROCESS_ROLE') !== 'worker') {
      return;
    }

    const host = this.configService.getOrThrow<string>('SMTP_HOST');
    const port = this.configService.getOrThrow<number>('SMTP_PORT');
    const user = this.configService.getOrThrow<string>('SMTP_USER');

    this.from = this.configService.getOrThrow<string>('MAIL_FROM');

    this.transporter = createTransport({
      host,
      port,
      secure: this.configService.getOrThrow<boolean>('SMTP_SECURE'),
      auth: {
        user,
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    });

    try {
      await this.transporter.verify();
      this.logger.log(`SMTP connection verified (${host}:${port})`);
    } catch (error) {
      // Don't crash the worker; sends fail and go through the retry flow.
      this.logger.error(
        `SMTP verification failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async send(params: {
    recipient: string;
    subject?: string | null;
    message: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email provider is not initialized (worker only)');
    }

    const info = await this.transporter.sendMail({
      from: this.from,
      to: params.recipient,
      subject: params.subject ?? '(no subject)',
      text: params.message,
    });

    this.logger.log(
      `Email sent to ${params.recipient} (messageId: ${info.messageId})`,
    );
  }
}
