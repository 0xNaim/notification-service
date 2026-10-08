import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  await NestFactory.createApplicationContext(AppModule);
}

void bootstrap();
