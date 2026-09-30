import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { RedisModule } from './redis/redis.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { envValidationSchema } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema
    }),

    PrismaModule,
    RabbitMQModule,
    RedisModule,
    NotificationsModule,
    MetricsModule,
    HealthModule,
  ],
})
export class AppModule {}
