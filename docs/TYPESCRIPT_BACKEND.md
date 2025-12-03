# TypeScript Examples Backend Integration Guide for Infra-Kit 

This guide shows you how to integrate Infra-Kit into your TypeScript backend projects.

## Table of Contents

- [Express.js Integration](#expressjs-integration)

- [Fastify Integration](#fastify-integration)

- [NestJS Integration](#nestjs-integration)

- [Hono Integration](#hono-integration)

- [TanStack Start Integration](#tanstack-start-integration)

- [Best Practices](#best-practices)

---

## Express.js Integration

### Installation

```bash

npm install express @omed0/infra-kit bullmq ioredis minio

npm install -D @types/express

```

### Basic Setup

```typescript
// src/config/infra.ts

import { initFromEnv } from "@omed0/infra-kit";

export function initInfrastructure() {
  initFromEnv();

  console.log("Infrastructure initialized");
}
```

```typescript
// src/index.ts

import express from "express";

import { initInfrastructure } from "./config/infra";

const app = express();

app.use(express.json());

// Initialize infrastructure

initInfrastructure();

// Your routes here

import { authRoutes } from "./routes/auth";

import { apiRoutes } from "./routes/api";

app.use("/auth", authRoutes);

app.use("/api", apiRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

### Middleware Examples

**Rate Limiting Middleware:**

```typescript
// src/middleware/rateLimit.ts

import { Request, Response, NextFunction } from "express";

import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

export function rateLimitMiddleware(
  limit: number,

  window: number,

  key: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || req.headers["x-forwarded-for"] || "unknown";

    try {
      const result = await checkRateLimit(String(identifier), {
        limit,

        window,

        key,
      });

      // Add rate limit headers

      res.setHeader("X-RateLimit-Limit", limit);

      res.setHeader("X-RateLimit-Remaining", result.remaining);

      res.setHeader("X-RateLimit-Reset", result.resetAt);

      if (!result.allowed) {
        res.setHeader(
          "Retry-After",
          Math.ceil((result.retryAfter || 0) / 1000)
        );

        return res.status(429).json({
          error: "Too many requests",

          retryAfter: result.retryAfter,
        });
      }

      next();
    } catch (error) {
      console.error("Rate limit error:", error);

      next(); // Fail open
    }
  };
}

// Usage in routes

app.get(
  "/api/data",

  rateLimitMiddleware(100, 60, "api"),

  (req, res) => {
    res.json({ data: "Hello World" });
  }
);
```

**Session Middleware:**

```typescript
// src/middleware/session.ts

import { Request, Response, NextFunction } from "express";

import { getSession, refreshSession } from "@omed0/infra-kit/session";

declare global {
  namespace Express {
    interface Request {
      session?: any;
    }
  }
}

export async function sessionMiddleware(
  req: Request,

  res: Response,

  next: NextFunction
) {
  const sessionId = req.headers["x-session-id"] as string;

  if (!sessionId) {
    return next();
  }

  try {
    const session = await getSession(sessionId);

    if (session) {
      req.session = session;

      // Refresh session on activity

      await refreshSession(sessionId, 86400);
    }

    next();
  } catch (error) {
    console.error("Session error:", error);

    next();
  }
}

// Usage

app.use(sessionMiddleware);
```

**Cache Middleware:**

```typescript
// src/middleware/cache.ts

import { Request, Response, NextFunction } from "express";

import { getCache, setCache } from "@omed0/infra-kit/cache";

export function cacheMiddleware(ttl: number = 300) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests

    if (req.method !== "GET") {
      return next();
    }

    const cacheKey = `cache:${req.originalUrl}`;

    try {
      const cached = await getCache(cacheKey);

      if (cached) {
        return res.json(cached);
      }

      // Override res.json to cache the response

      const originalJson = res.json.bind(res);

      res.json = (data: any) => {
        setCache(cacheKey, data, ttl).catch(console.error);

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("Cache error:", error);

      next();
    }
  };
}

// Usage

app.get(
  "/api/posts",

  cacheMiddleware(600), // Cache for 10 minutes

  async (req, res) => {
    const posts = await fetchPosts();

    res.json(posts);
  }
);
```

### Background Job Service

```typescript
// src/services/jobs.ts

import { addJob, processJobs } from "@omed0/infra-kit/queue";

import { sendEmail } from "./email";

// Define job types

interface EmailJob {
  to: string;

  subject: string;

  body: string;

  html?: string;
}

interface ImageProcessingJob {
  imageUrl: string;

  userId: string;

  operations: string[];
}

// Add jobs

export async function scheduleEmail(data: EmailJob) {
  return await addJob("emails", "send-email", data, {
    attempts: 3,

    backoff: {
      type: "exponential",

      delay: 1000,
    },
  });
}

export async function scheduleImageProcessing(data: ImageProcessingJob) {
  return await addJob("images", "process-image", data, {
    attempts: 2,

    timeout: 30000, // 30 seconds
  });
}

// Process jobs (run this in a separate worker process)

export function startWorkers() {
  // Email worker

  processJobs<EmailJob>(
    "emails",
    async (job) => {
      console.log(`Processing email job ${job.id}`);

      await sendEmail(job.data);

      return { sent: true, timestamp: Date.now() };
    },
    {
      concurrency: 5,
    }
  );

  // Image processing worker

  processJobs<ImageProcessingJob>(
    "images",
    async (job) => {
      console.log(`Processing image ${job.data.imageUrl}`);

      // Image processing logic

      return { processed: true };
    },
    {
      concurrency: 2,
    }
  );

  console.log("Workers started");
}
```

### File Upload Handler

```typescript
// src/routes/upload.ts

import express from "express";

import multer from "multer";

import { uploadFile, getDownloadUrl } from "@omed0/infra-kit/storage";

import { randomBytes } from "crypto";

import path from "path";

const router = express.Router();

const upload = multer({ dest: "/tmp/uploads" });

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const fileId = randomBytes(16).toString("hex");

    const ext = path.extname(req.file.originalname);

    const objectName = `uploads/${req.session?.userId}/${fileId}${ext}`;

    // Upload to MinIO

    await uploadFile("user-uploads", objectName, req.file.path, {
      "Content-Type": req.file.mimetype,

      "Original-Name": req.file.originalname,
    });

    // Generate download URL

    const downloadUrl = await getDownloadUrl("user-uploads", objectName, 3600);

    res.json({
      success: true,

      fileId,

      downloadUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);

    res.status(500).json({ error: "Upload failed" });
  }
});

export { router as uploadRoutes };
```

---

## Fastify Integration

### Installation

```bash

npm install fastify @omed0/infra-kit bullmq ioredis minio

```

### Setup with Plugins

```typescript
// src/plugins/infra.ts

import { FastifyPluginAsync } from "fastify";

import fp from "fastify-plugin";

import { initFromEnv } from "@omed0/infra-kit";

import * as cache from "@omed0/infra-kit/cache";

import * as queue from "@omed0/infra-kit/queue";

import * as storage from "@omed0/infra-kit/storage";

const infraPlugin: FastifyPluginAsync = async (fastify) => {
  initFromEnv();

  // Decorate fastify instance with infra-kit modules

  fastify.decorate("cache", cache);

  fastify.decorate("queue", queue);

  fastify.decorate("storage", storage);

  fastify.log.info("Infrastructure initialized");
};

export default fp(infraPlugin);
```

```typescript
// src/index.ts

import Fastify from "fastify";

import infraPlugin from "./plugins/infra";

const fastify = Fastify({
  logger: true,
});

// Register infra plugin

await fastify.register(infraPlugin);

// Routes

fastify.get("/api/data", async (request, reply) => {
  const cached = await fastify.cache.getCache("data");

  if (cached) return cached;

  const data = { message: "Hello World" };

  await fastify.cache.setCache("data", data, 300);

  return data;
});

await fastify.listen({ port: 3000 });
```

### Rate Limiting Hook

```typescript
// src/hooks/rateLimit.ts

import { FastifyRequest, FastifyReply } from "fastify";

import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

export async function rateLimitHook(
  request: FastifyRequest,

  reply: FastifyReply
) {
  const identifier = request.ip;

  const result = await checkRateLimit(identifier, {
    limit: 100,

    window: 60,

    key: "api",
  });

  reply.header("X-RateLimit-Limit", 100);

  reply.header("X-RateLimit-Remaining", result.remaining);

  reply.header("X-RateLimit-Reset", result.resetAt);

  if (!result.allowed) {
    reply.status(429).send({
      error: "Too many requests",

      retryAfter: result.retryAfter,
    });
  }
}

// Usage

fastify.addHook("preHandler", rateLimitHook);
```

---

## NestJS Integration

### Installation

```bash

npm install @nestjs/common @nestjs/core @omed0/infra-kit bullmq ioredis minio

```

### Module Setup

```typescript
// src/infra/infra.module.ts

import { Module, Global, OnModuleInit } from "@nestjs/common";

import { ConfigModule, ConfigService } from "@nestjs/config";

import { initConfig } from "@omed0/infra-kit";

import { CacheService } from "./cache.service";

import { QueueService } from "./queue.service";

import { StorageService } from "./storage.service";

@Global()
@Module({
  imports: [ConfigModule],

  providers: [CacheService, QueueService, StorageService],

  exports: [CacheService, QueueService, StorageService],
})
export class InfraModule implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    initConfig({
      redis: {
        host: this.configService.get("REDIS_HOST", "localhost"),

        port: this.configService.get("REDIS_PORT", 6379),

        password: this.configService.get("REDIS_PASSWORD"),
      },

      storage: {
        endPoint: this.configService.get("S3_ENDPOINT", "localhost"),

        port: this.configService.get("S3_PORT", 9000),

        accessKey: this.configService.get("S3_ACCESS_KEY", "minioadmin"),

        secretKey: this.configService.get("S3_SECRET_KEY", "minioadmin"),
      },
    });
  }
}
```

### Service Wrappers

```typescript
// src/infra/cache.service.ts

import { Injectable } from "@nestjs/common";

import * as cache from "@omed0/infra-kit/cache";

@Injectable()
export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    return cache.getCache<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    return cache.setCache(key, value, ttl);
  }

  async delete(key: string | string[]): Promise<number> {
    return cache.deleteCache(key);
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    return cache.increment(key, amount);
  }
}
```

```typescript
// src/infra/queue.service.ts

import { Injectable, OnModuleInit } from "@nestjs/common";

import * as queue from "@omed0/infra-kit/queue";

@Injectable()
export class QueueService implements OnModuleInit {
  onModuleInit() {
    // Start workers

    this.startEmailWorker();
  }

  async addJob<T>(queueName: string, jobName: string, data: T, options?: any) {
    return queue.addJob(queueName, jobName, data, options);
  }

  private startEmailWorker() {
    queue.processJobs("emails", async (job) => {
      // Email processing logic

      console.log("Processing email:", job.data);

      return { sent: true };
    });
  }
}
```

### Controller Usage

```typescript
// src/users/users.controller.ts

import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";

import { CacheService } from "../infra/cache.service";

import { QueueService } from "../infra/queue.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly cacheService: CacheService,

    private readonly queueService: QueueService
  ) {}

  @Get()
  async getUsers() {
    const cached = await this.cacheService.get("users:all");

    if (cached) return cached;

    const users = await this.fetchUsers();

    await this.cacheService.set("users:all", users, 300);

    return users;
  }

  @Post()
  async createUser(@Body() userData: any) {
    const user = await this.saveUser(userData);

    // Send welcome email in background

    await this.queueService.addJob("emails", "welcome", {
      to: user.email,

      name: user.name,
    });

    return user;
  }

  private async fetchUsers() {
    // Fetch from database

    return [];
  }

  private async saveUser(data: any) {
    // Save to database

    return data;
  }
}
```

---

## Hono Integration

### Installation

```bash

npm install hono @omed0/infra-kit bullmq ioredis minio

```

### Setup

```typescript
// src/index.ts

import { Hono } from "hono";

import { initFromEnv } from "@omed0/infra-kit";

import { getCache, setCache } from "@omed0/infra-kit/cache";

import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

const app = new Hono();

// Initialize

initFromEnv();

// Rate limit middleware

app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";

  const result = await checkRateLimit(ip, {
    limit: 100,

    window: 60,

    key: "api",
  });

  c.header("X-RateLimit-Limit", "100");

  c.header("X-RateLimit-Remaining", result.remaining.toString());

  if (!result.allowed) {
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});

// Cache middleware

const cacheMiddleware = (ttl: number) => {
  return async (c: any, next: any) => {
    const cacheKey = `cache:${c.req.url}`;

    const cached = await getCache(cacheKey);

    if (cached) {
      return c.json(cached);
    }

    await next();

    // Cache the response

    const response = c.res;

    if (response.ok) {
      const data = await response.clone().json();

      await setCache(cacheKey, data, ttl);
    }
  };
};

// Routes

app.get("/api/data", cacheMiddleware(300), (c) => {
  return c.json({ message: "Hello World" });
});

export default app;
```

---

## TanStack Start Integration

### Setup

```typescript
// app/lib/infra.ts

import { initFromEnv } from "@omed0/infra-kit";

let initialized = false;

export function initInfra() {
  if (!initialized) {
    initFromEnv();

    initialized = true;
  }
}
```

### API Routes

```typescript
// app/routes/api/users.ts

import { createAPIFileRoute } from "@tanstack/start/api";

import { getCache, setCache } from "@omed0/infra-kit/cache";

import { initInfra } from "~/lib/infra";

export const Route = createAPIFileRoute("/api/users")({
  GET: async ({ request }) => {
    initInfra();

    const cached = await getCache("users:all");

    if (cached) {
      return Response.json(cached);
    }

    const users = await fetchUsers();

    await setCache("users:all", users, 300);

    return Response.json(users);
  },
});

async function fetchUsers() {
  // Fetch from database

  return [];
}
```

---

## Best Practices

### 1. Error Handling

```typescript
import { getCache, setCache } from "@omed0/infra-kit/cache";

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

### 2. Connection Management

```typescript
// src/config/infra.ts

import { initConfig, disconnect } from "@omed0/infra-kit";

export function initInfra() {
  initConfig({
    redis: {
      host: process.env.REDIS_HOST || "localhost",

      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
  });
}

// Graceful shutdown

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");

  await disconnect();

  process.exit(0);
});
```

### 3. Type Safety

```typescript
// src/types/jobs.ts

export interface EmailJob {
  to: string;

  subject: string;

  body: string;
}

export interface ImageJob {
  url: string;

  operations: ("resize" | "compress" | "watermark")[];
}

// Usage

import { addJob } from "@omed0/infra-kit/queue";

import type { EmailJob } from "./types/jobs";

async function scheduleEmail(data: EmailJob) {
  return addJob<EmailJob>("emails", "send", data);
}
```

### 4. Environment Configuration

```env

# .env

NODE_ENV=production



# Redis

REDIS_HOST=redis.example.com

REDIS_PORT=6379

REDIS_PASSWORD=your-secure-password

REDIS_DB=0



# Storage

S3_ENDPOINT=minio.example.com

S3_PORT=9000

S3_ACCESS_KEY=access-key

S3_SECRET_KEY=secret-key

S3_USE_SSL=true

S3_REGION=us-east-1

```

### 5. Testing

```typescript
// src/__tests__/cache.test.ts

import { initConfig } from "@omed0/infra-kit";

import { setCache, getCache } from "@omed0/infra-kit/cache";

beforeAll(() => {
  initConfig({
    redis: {
      host: "localhost",

      port: 6379,
    },
  });
});

test("cache operations", async () => {
  await setCache("test-key", { data: "test" }, 60);

  const result = await getCache("test-key");

  expect(result).toEqual({ data: "test" });
});
```

---
