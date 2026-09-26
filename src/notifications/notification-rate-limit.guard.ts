import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { RedisRateLimiterService } from '../redis/redis-rate-limiter.service.js';

@Injectable()
export class NotificationRateLimitGuard implements CanActivate {
  private readonly limit = 20;
  private readonly windowSeconds = 60;

  constructor(private readonly rateLimiter: RedisRateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

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

      if (!result.allowed) {
        throw new HttpException(
          `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.warn(
        'Redis rate limiter unavailable. Continuing without rate limiting.',
      );
    }

    return true;
  }
}
