import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

@Injectable()
export class RedisRateLimiterService {
  private readonly logger = new Logger(RedisRateLimiterService.name);

  constructor(private readonly redis: RedisService) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const redisKey = `rate-limit:${key}`;

    const script = `
      local current = redis.call(
        'INCR',
        KEYS[1]
      )

      if current == 1 then
        redis.call(
          'EXPIRE',
          KEYS[1],
          ARGV[1]
        )
      end

      local ttl = redis.call(
        'TTL',
        KEYS[1]
      )

      return {
        current,
        ttl
      }
    `;

    const result = (await this.redis
      .getClient()
      .eval(script, 1, redisKey, windowSeconds)) as [number, number];

    const currentCount = result[0];
    const ttl = result[1];

    const allowed = currentCount <= limit;
    const remaining = Math.max(0, limit - currentCount);

    return { allowed, limit, remaining, retryAfter: ttl };
  }
}
