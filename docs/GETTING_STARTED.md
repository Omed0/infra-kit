# Getting Started with Infra-Kit

This guide will help you get up and running with Infra-Kit in just a few minutes.

## What is Infra-Kit?

Infra-Kit is a production-ready TypeScript SDK that provides essential infrastructure services for modern backend applications:

- 📦 **Queue Management** - Background job processing

- ⚡ **Caching** - High-performance data caching

- 📁 **Object Storage** - S3-compatible file storage

- 🔔 **Event Bus** - Pub/Sub messaging

- 🛡️ **Rate Limiting** - Request throttling

- 🔒 **Distributed Locking** - Concurrent access control

- 👤 **Session Management** - User session storage

## Quick Start (5 minutes)

### 1. Install Infra-Kit

```bash

npm install @omed0/infra-kit bullmq ioredis minio

```

### 2. Start Infrastructure Services

Create a `docker-compose.yml`:

```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine

    ports:
      - "6379:6379"

  minio:
    image: bitnami/minio:latest

    ports:
      - "9000:9000"

      - "9001:9001"

    environment:
      MINIO_ROOT_USER: minioadmin

      MINIO_ROOT_PASSWORD: minioadmin
```

Start services:

```bash

docker-compose up -d

```

### 3. Initialize Infra-Kit

Create a file `src/config.ts`:

```typescript
import { initConfig } from "@omed0/infra-kit";

export function setupInfrastructure() {
  initConfig({
    redis: {
      host: "localhost",

      port: 6379,
    },

    storage: {
      endPoint: "localhost",

      port: 9000,

      accessKey: "minioadmin",

      secretKey: "minioadmin",

      useSSL: false,
    },
  });

  console.log("✅ Infrastructure initialized");
}
```

### 4. Use Infra-Kit Features

Create a file `src/index.ts`:

```typescript
import { setupInfrastructure } from "./config";

import { setCache, getCache } from "@omed0/infra-kit/cache";

import { addJob, processJobs } from "@omed0/infra-kit/queue";

// Initialize

setupInfrastructure();

// Example 1: Caching

async function cachingExample() {
  // Set a value with 60 second TTL

  await setCache(
    "user:123",
    { name: "John Doe", email: "john@example.com" },
    60
  );

  // Get the value

  const user = await getCache("user:123");

  console.log("Cached user:", user);
}

// Example 2: Background Jobs

async function queueExample() {
  // Add a job to the queue

  await addJob("emails", "send-welcome", {
    to: "user@example.com",

    subject: "Welcome!",

    body: "Thanks for signing up",
  });

  console.log("✅ Job queued");

  // Process jobs

  processJobs("emails", async (job) => {
    console.log("📧 Sending email to:", job.data.to);

    // Your email sending logic here

    return { sent: true };
  });
}

// Run examples

cachingExample();

queueExample();
```

### 5. Run Your Application

```bash

npx tsx src/index.ts

```

That's it! You're now using Infra-Kit.

## Next Steps

### Learn More About Each Module

1. **[Queue Management](./TYPESCRIPT_BACKEND.md#queue-management)**

   - Background job processing

   - Scheduled tasks

   - Job retry logic

2. **[Caching](./TYPESCRIPT_BACKEND.md#caching)**

   - Fast data access

   - TTL management

   - Atomic operations

3. **[Object Storage](./TYPESCRIPT_BACKEND.md#object-storage)**

   - File uploads/downloads

   - Presigned URLs

   - Object listing

4. **[Event Bus](./TYPESCRIPT_BACKEND.md#event-bus)**

   - Real-time events

   - Pattern matching

   - Multiple subscribers

5. **[Rate Limiting](./TYPESCRIPT_BACKEND.md#rate-limiting)**

   - API protection

   - User quotas

   - Sliding window algorithm

6. **[Distributed Locking](./TYPESCRIPT_BACKEND.md#distributed-locking)**

   - Critical sections

   - Data consistency

   - Concurrent access control

7. **[Session Management](./TYPESCRIPT_BACKEND.md#session-management)**

   - User sessions

   - TTL refresh

   - Secure storage

## Common Patterns

### Pattern 1: Cache-Aside

```typescript
import { getCache, setCache } from "@omed0/infra-kit/cache";

async function getUser(userId: string) {
  // Try cache first

  const cached = await getCache(`user:${userId}`);

  if (cached) return cached;

  // Cache miss - fetch from database

  const user = await db.users.findById(userId);

  // Store in cache for 5 minutes

  await setCache(`user:${userId}`, user, 300);

  return user;
}
```

### Pattern 2: Background Job Processing

```typescript
import { addJob, processJobs } from "@omed0/infra-kit/queue";

// In your API route

async function createUser(data: any) {
  const user = await db.users.create(data);

  // Queue welcome email (don't wait)

  await addJob("emails", "welcome", {
    to: user.email,

    name: user.name,
  });

  return user;
}

// In a separate worker process

processJobs(
  "emails",
  async (job) => {
    await sendEmail(job.data);

    return { sent: true };
  },
  { concurrency: 5 }
);
```

### Pattern 3: Rate Limiting Middleware

```typescript
import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

async function rateLimitMiddleware(req, res, next) {
  const result = await checkRateLimit(req.ip, {
    limit: 100,

    window: 60,

    key: "api",
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: "Too many requests",

      retryAfter: result.retryAfter,
    });
  }

  next();
}
```

### Pattern 4: Distributed Lock for Critical Operations

```typescript
import { withLock } from "@omed0/infra-kit/lock";

async function transferMoney(from: string, to: string, amount: number) {
  // Ensure only one transfer happens at a time for these accounts

  await withLock(
    `transfer:${from}:${to}`,
    async () => {
      const fromBalance = await getBalance(from);

      if (fromBalance < amount) throw new Error("Insufficient funds");

      await updateBalance(from, fromBalance - amount);

      await updateBalance(to, (await getBalance(to)) + amount);
    },
    { ttl: 5000 }
  );
}
```

### Pattern 5: Event-Driven Architecture

```typescript
import { publish, subscribe } from "@omed0/infra-kit/events";

// Service A: Publishes events

async function createOrder(orderData: any) {
  const order = await db.orders.create(orderData);

  await publish("order.created", {
    orderId: order.id,

    userId: order.userId,

    total: order.total,
  });

  return order;
}

// Service B: Subscribes to events

await subscribe("order.created", async (data) => {
  // Send confirmation email

  await sendOrderConfirmation(data.userId, data.orderId);
});

// Service C: Also subscribes

await subscribe("order.created", async (data) => {
  // Update analytics

  await updateSalesMetrics(data);
});
```

## Environment Configuration

For production, use environment variables:

```typescript
// src/config.ts

import { initFromEnv } from "@omed0/infra-kit";

export function setupInfrastructure() {
  initFromEnv();
}
```

Create `.env`:

```env

# Redis Configuration

REDIS_HOST=redis.example.com

REDIS_PORT=6379

REDIS_PASSWORD=your-secure-password

REDIS_DB=0



# Storage Configuration

S3_ENDPOINT=minio.example.com

S3_PORT=9000

S3_ACCESS_KEY=your-access-key

S3_SECRET_KEY=your-secret-key

S3_USE_SSL=true

S3_REGION=us-east-1

```

## Best Practices

### 1. Use TypeScript

```typescript
interface EmailJob {
  to: string;

  subject: string;

  body: string;
}

await addJob<EmailJob>("emails", "send", {
  to: "user@example.com",

  subject: "Hello",

  body: "Welcome!",
});
```

### 2. Handle Errors

```typescript
import { getCache } from "@omed0/infra-kit/cache";

async function getCachedData(key: string) {
  try {
    return await getCache(key);
  } catch (error) {
    console.error("Cache error:", error);

    // Fail gracefully

    return null;
  }
}
```

### 3. Separate Workers from Web Servers

```typescript
// web.ts - handles HTTP requests

import express from "express";

const app = express();

// ... your routes

// worker.ts - processes background jobs

import { processJobs } from "@omed0/infra-kit/queue";

processJobs("emails", emailProcessor);

processJobs("images", imageProcessor);
```

### 4. Use Appropriate TTLs

```typescript
// Short TTL for frequently changing data

await setCache("trending:posts", posts, 60); // 1 minute

// Medium TTL for semi-static data

await setCache("user:profile", profile, 3600); // 1 hour

// Long TTL for rarely changing data

await setCache("app:config", config, 86400); // 24 hours
```

### 5. Monitor Your Infrastructure

```typescript
import { getQueueMetrics } from "@omed0/infra-kit/queue";

async function healthCheck() {
  const metrics = await getQueueMetrics("emails");

  if (metrics.failed > 100) {
    console.warn("Too many failed jobs!");
  }

  return {
    queues: {
      emails: metrics,
    },
  };
}
```

## Troubleshooting

### Redis Connection Issues

```typescript
// Enable connection logging

initConfig({
  redis: {
    host: "localhost",

    port: 6379,

    retryStrategy(times) {
      console.log(`Redis retry attempt ${times}`);

      return Math.min(times * 50, 2000);
    },
  },
});
```

### Storage Upload Failures

```typescript
import { uploadFile } from "@omed0/infra-kit/storage";

try {
  await uploadFile("bucket", "file.txt", "/path/to/file.txt");
} catch (error) {
  console.error("Upload failed:", error);

  // Check:

  // 1. Bucket exists

  // 2. Credentials are correct

  // 3. Network connectivity
}
```

### Job Processing Errors

```typescript
processJobs(
  "emails",
  async (job) => {
    try {
      await sendEmail(job.data);

      return { sent: true };
    } catch (error) {
      console.error("Job failed:", job.id, error);

      // Job will be retried based on attempts setting

      throw error;
    }
  },
  {
    concurrency: 5,
  }
);
```

## Example Projects

### Express.js REST API

```typescript
import express from "express";

import { initFromEnv } from "@omed0/infra-kit";

import { setCache, getCache } from "@omed0/infra-kit/cache";

import { addJob } from "@omed0/infra-kit/queue";

const app = express();

app.use(express.json());

initFromEnv();

app.post("/users", async (req, res) => {
  const user = await createUser(req.body);

  // Queue welcome email

  await addJob("emails", "welcome", {
    to: user.email,

    name: user.name,
  });

  res.json(user);
});

app.get("/users/:id", async (req, res) => {
  const cached = await getCache(`user:${req.params.id}`);

  if (cached) return res.json(cached);

  const user = await getUser(req.params.id);

  await setCache(`user:${req.params.id}`, user, 300);

  res.json(user);
});

app.listen(3000);
```

### Next Steps

1. **Read the full documentation**: [TYPESCRIPT_BACKEND.md](./TYPESCRIPT_BACKEND.md)

2. **Learn about deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)

## Getting Help

- 📖 [Documentation](https://github.com/omed0/infra-kit/tree/main/docs)

- 🐛 [Report Issues](https://github.com/omed0/infra-kit/issues)

- 💬 [GitHub Discussions](https://github.com/omed0/infra-kit/discussions)

## What's Next?

Now that you have the basics:

1. Explore advanced features

2. Integrate with your backend framework

3. Deploy to production

4. Monitor and optimize

Happy coding! 🚀
