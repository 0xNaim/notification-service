import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';
import { MetricsController } from './metrics.controller.js';

@Module({
  providers: [MetricsService],
  controllers: [MetricsController]
})
export class MetricsModule {}
