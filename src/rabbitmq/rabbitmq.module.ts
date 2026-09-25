import { Global, Module } from '@nestjs/common';
import { OutboxPublisher } from './outbox.publisher.js';
import { RabbitMQService } from './rabbitmq.service.js';

@Global()
@Module({
  providers: [RabbitMQService, OutboxPublisher],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
