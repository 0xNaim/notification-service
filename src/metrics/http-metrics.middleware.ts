import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      const route = req.route?.path ?? req.path;

      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      this.metrics.httpRequestsTotal.inc(labels);

      this.metrics.httpRequestDuration.observe(labels, durationSeconds);
    });

    next();
  }
}
