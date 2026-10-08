# Notification Service

A production-oriented notification backend built with **NestJS**, designed to handle asynchronous notification processing with reliability, observability, and horizontal scalability in mind.

## Tech Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- RabbitMQ
- Redis
- Docker
- Prometheus + Grafana

## Architecture

```text
Client
  ↓
NestJS API
  ↓
PostgreSQL + Outbox
  ↓
RabbitMQ
  ↓
Notification Workers
  ↓
Email / Notification Provider
```

Redis is used for rate limiting, idempotency, and distributed coordination.

## Key Features

- REST API for creating and retrieving notifications
- Transactional Outbox Pattern
- Asynchronous RabbitMQ processing
- Idempotent consumer
- Retry with exponential backoff
- Dead Letter Queue (DLQ)
- Redis-based rate limiting and distributed locking
- Health checks and graceful shutdown
- Prometheus metrics and Grafana dashboards
- Structured production logging
- Dockerized deployment
- Horizontal API and worker scaling
- PostgreSQL query/index optimization
- Failure handling and recovery strategies

## Reliability

The system follows an **at-least-once delivery** model with idempotent processing to safely handle duplicate messages and worker failures.

Temporary failures are retried, while permanently failed notifications are moved to the DLQ for later inspection or recovery.

## Running Locally

```bash
npm install

docker compose up -d

npx prisma migrate dev

npm run start:dev
```

API:

```text
http://localhost:3000
```

Metrics:

```text
http://localhost:3000/metrics
```

RabbitMQ:

```text
http://localhost:15672
```

Grafana:

```text
http://localhost:3001
```

## Learning Focus

This project was built to explore real-world backend engineering concepts including **distributed systems, message queues, reliability, observability, failure handling, and horizontal scaling**.
