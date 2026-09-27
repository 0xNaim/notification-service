import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: Registry;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly notificationsCreatedTotal: Counter<string>;
  readonly notificationsSentTotal: Counter<string>;
  readonly notificationsFailedTotal: Counter<string>;
  readonly notificationProcessingDuration: Histogram<string>;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({
      register: this.registry,
    });

    this.httpRequestsTotal = new Counter({
      name: 'notification_service_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'notification_service_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    });

    this.notificationsCreatedTotal = new Counter({
      name: 'notification_service_notifications_created_total',
      help: 'Total number of notifications created',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.notificationsSentTotal = new Counter({
      name: 'notification_service_notifications_sent_total',
      help: 'Total number of notifications successfully sent',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.notificationsFailedTotal = new Counter({
      name: 'notification_service_notifications_failed_total',
      help: 'Total number of notification processing failures',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.notificationProcessingDuration = new Histogram({
      name: 'notification_service_processing_duration_seconds',
      help: 'Notification processing duration in seconds',
      labelNames: ['type'],
      registers: [this.registry],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
