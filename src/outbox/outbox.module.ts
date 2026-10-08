import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { OutboxPublisher } from './outbox.publisher.js';

@Module({
  imports: [PrismaModule, RabbitMQModule],
  providers: [OutboxPublisher],
})
export class OutboxModule {}
