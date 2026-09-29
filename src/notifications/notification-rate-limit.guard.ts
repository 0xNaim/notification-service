import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service.js';
import { RedisRateLimiterService } from '../redis/redis-rate-limiter.service.js';

@Injectable()
export class NotificationRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(NotificationRateLimitGuard.name);

  private readonly limit = 20;
  private readonly windowSeconds = 60;

  constructor(
    private readonly rateLimiter: RedisRateLimiterService,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const userId = request.body?.userId;

    if (!userId) {
      return true;
    }

    try {
      const result = await this.rateLimiter.consume(
        `user:${userId}`,
        this.limit,
        this.windowSeconds,
      );

      response.setHeader('X-RateLimit-Limit', result.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('Retry-After', result.retryAfter);

      if (!result.allowed) {
        throw new HttpException(
          `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.metrics.redisErrorsTotal.inc();

      this.logger.warn(
        'Redis rate limiter unavailable. Continuing without rate limiting.',
      );

      return true;
    }
  }
}
