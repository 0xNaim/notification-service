import { Global, Module } from '@nestjs/common';
import { RedisRateLimiterService } from './redis-rate-limiter.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService, RedisRateLimiterService],
  exports: [RedisService, RedisRateLimiterService],
})
export class RedisModule {}
