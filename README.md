# 🚀 Infra-Kit

A comprehensive TypeScript/JavaScript SDK for self-hosted infrastructure services. Built for production with BullMQ, Redis, and MinIO.

[![npm version](https://img.shields.io/npm/v/@omed0/infra-kit.svg)](https://www.npmjs.com/package/@omed0/infra-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/Omed0/infra-kit?style=social)](https://github.com/Omed0/infra-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

## Features

- 📦 **Queue Management** - Background jobs with BullMQ
- ⚡ **Cache** - High-performance caching with Redis
- 📁 **Object Storage** - S3-compatible storage with MinIO
- 🔔 **Event Bus** - Pub/Sub messaging with Redis
- 🛡️ **Rate Limiting** - Sliding window rate limiting
- 🔒 **Distributed Locking** - Redis-based distributed locks
- 👤 **Session Management** - Secure session storage

## Installation

```bash
npm install @omed0/infra-kit
npm install --save bullmq ioredis minio
# or
pnpm add @omed0/infra-kit
pnpm add -D bullmq ioredis minio
# or
bun add @omed0/infra-kit
bun add -D bullmq ioredis minio
```

## Quick Start

### 1. Initialize Configuration

```typescript
import { initConfig } from "@omed0/infra-kit";

// Programmatic configuration
initConfig({
  redis: {
    host: "localhost",
    port: 6379,
    password: "your-password",
  },
  storage: {
    endPoint: "localhost",
    port: 9000,
    accessKey: "minioadmin",
    secretKey: "minioadmin",
  },
});

// Or from environment variables
import { initFromEnv } from "@omed0/infra-kit";
initFromEnv();
```

### 2. Use the Modules

**Queue Management**

```typescript
import { addJob, processJobs } from "@omed0/infra-kit/queue";

// Add a job
await addJob(
  "emails",
  "send-welcome",
  {
    to: "user@example.com",
    subject: "Welcome!",
  },
  {
    delay: 5000,
    attempts: 3,
  }
);

// Process jobs
processJobs(
  "emails",
  async (job) => {
    console.log("Sending email:", job.data);
    // Send email logic
    return { sent: true };
  },
  { concurrency: 5 }
);
```

**Cache**

```typescript
import { setCache, getCache } from "@omed0/infra-kit/cache";

// Set with TTL
await setCache("user:123", { name: "John", email: "john@example.com" }, 3600);

// Get
const user = await getCache("user:123");
console.log(user?.name);
```

**Object Storage**

```typescript
import { uploadFile, getDownloadUrl } from "@omed0/infra-kit/storage";

// Upload file
await uploadFile("uploads", "images/photo.jpg", "/tmp/photo.jpg");

// Get presigned download URL
const url = await getDownloadUrl("uploads", "images/photo.jpg", 3600);
```

**Event Bus**

```typescript
import { publish, subscribe } from "@omed0/infra-kit/events";

// Subscribe
await subscribe("user.created", (data) => {
  console.log("New user:", data);
});

// Publish
await publish("user.created", {
  userId: "123",
  email: "user@example.com",
});
```

**Rate Limiting**

```typescript
import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

const result = await checkRateLimit("user:123", {
  limit: 100,
  window: 60,
  key: "api-requests",
});

if (!result.allowed) {
  throw new Error(`Rate limit exceeded. Retry in ${result.retryAfter}ms`);
}
```

**Distributed Locking**

```typescript
import { withLock } from "@omed0/infra-kit/lock";

await withLock(
  "critical-section",
  async () => {
    // Critical work here
    console.log("Locked section");
  },
  { ttl: 30000 }
);
```

**Session Management**

```typescript
import { setSession, getSession } from "@omed0/infra-kit/session";

// Create session
await setSession(
  "sess_123",
  {
    userId: "456",
    email: "user@example.com",
  },
  { ttl: 3600 }
);

// Get session
const session = await getSession("sess_123");
```

## Configuration

### Environment Variables

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0

# Storage (MinIO/S3)
S3_ENDPOINT=localhost
S3_PORT=9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_USE_SSL=false
```

## API Documentation

### Queue

- `addJob(queueName, jobName, data, options)` - Add a job
- `addBulkJobs(queueName, jobs)` - Add multiple jobs
- `scheduleJob(queueName, jobName, data, repeatOptions)` - Schedule recurring job
- `processJobs(queueName, processor, options)` - Process jobs
- `getQueueMetrics(queueName)` - Get queue stats
- `cleanQueue(queueName, grace, limit, type)` - Clean old jobs
- `pauseQueue(queueName)` / `resumeQueue(queueName)` - Control queue

### Cache

- `setCache(key, value, ttl)` - Set cache entry
- `getCache(key)` - Get cache entry
- `deleteCache(key)` - Delete entry
- `hasCache(key)` - Check if exists
- `increment(key, amount)` / `decrement(key, amount)` - Atomic operations
- `getMany(keys)` / `setMany(entries)` - Bulk operations
- `clearCache()` - Clear all cache

### Storage

- `uploadFile(bucket, objectName, filePath, metadata)` - Upload file
- `downloadFile(bucket, objectName, filePath)` - Download file
- `deleteObject(bucket, objectName)` - Delete object
- `listObjects(bucket, prefix, recursive)` - List objects
- `getUploadUrl(bucket, objectName, expiry)` - Presigned upload URL
- `getDownloadUrl(bucket, objectName, expiry)` - Presigned download URL

### Events

- `publish(channel, data)` - Publish event
- `subscribe(channel, handler)` - Subscribe to events
- `subscribeMany(channels, handler)` - Subscribe to multiple channels
- `unsubscribe(channel)` - Unsubscribe from channel

### Rate Limit

- `checkRateLimit(identifier, options)` - Check and consume rate limit
- `peekRateLimit(identifier, options)` - Check without consuming
- `resetRateLimit(identifier, key)` - Reset limits
- `createRateLimiter(options)` - Create reusable limiter

### Lock

- `acquireLock(key, options)` - Acquire lock
- `releaseLock(key, token)` - Release lock
- `extendLock(key, token, ttl)` - Extend lock TTL
- `withLock(key, fn, options)` - Execute with lock

### Session

- `setSession(sessionId, data, options)` - Create/update session
- `getSession(sessionId)` - Get session data
- `updateSession(sessionId, data, options)` - Merge update
- `deleteSession(sessionId)` - Delete session
- `refreshSession(sessionId, ttl)` - Refresh TTL

## Docker Setup

Use this `docker-compose.yml` for local development:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: bitnami/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data

volumes:
  redis_data:
  minio_data:
```

## Module Exports

Import specific modules for better tree-shaking:

```typescript
import { addJob } from "@omed0/infra-kit/queue";
import { setCache } from "@omed0/infra-kit/cache";
import { uploadFile } from "@omed0/infra-kit/storage";
import { publish } from "@omed0/infra-kit/events";
import { checkRateLimit } from "@omed0/infra-kit/rate-limit";
import { acquireLock } from "@omed0/infra-kit/lock";
import { setSession } from "@omed0/infra-kit/session";
```

## TypeScript Support

Full TypeScript support with type definitions included.

```typescript
import type { Config, RateLimitResult } from "@omed0/infra-kit";
```

## License

MIT © [Omed0](https://github.com/Omed0)

## Contributing

Contributions welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) and open an issue or PR.

## Support

- 📖 [Documentation](https://github.com/Omed0/infra-kit#readme)
- 🐛 [Issues](https://github.com/Omed0/infra-kit/issues)
- 💬 [Discussions](https://github.com/Omed0/infra-kit/discussions)
- 📦 [npm Package](https://www.npmjs.com/package/@omed0/infra-kit)
