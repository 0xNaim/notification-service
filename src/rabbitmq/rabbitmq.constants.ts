// Notification exchange
export const RABBITMQ_EXCHANGE = 'notification.exchange';
export const RABBITMQ_QUEUE = 'notification.queue';
export const RABBITMQ_ROUTING_KEY = 'notification.created';

// Retry queues
export const RETRY_1_QUEUE = 'notification.retry.1s';
export const RETRY_2_QUEUE = 'notification.retry.2s';
export const RETRY_3_QUEUE = 'notification.retry.4s';

// Dead Letter Queue
export const DLQ_QUEUE = 'notification.dlq';

// Retry routing keys
export const RETRY_1_ROUTING_KEY = 'notification.retry.1s';
export const RETRY_2_ROUTING_KEY = 'notification.retry.2s';
export const RETRY_3_ROUTING_KEY = 'notification.retry.4s';
export const DLQ_ROUTING_KEY = 'notification.dlq';
