# Deployment Guide

Complete guide for deploying Infra-Kit in production environments, both self-hosted and with cloud providers.

## Table of Contents

- [Self-Hosted Deployment](#self-hosted-deployment)

- [Cloud Provider Integration](#cloud-provider-integration)

- [Production Best Practices](#production-best-practices)

- [Monitoring & Observability](#monitoring--observability)

- [Security Considerations](#security-considerations)

---

## Self-Hosted Deployment

### Docker Compose (Recommended for Development)

Create a `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  # Redis for caching, queues, sessions, etc.

  redis:
    image: redis:7-alpine

    container_name: infra-redis

    restart: unless-stopped

    ports:
      - "6379:6379"

    command: >

      redis-server

      --requirepass ${REDIS_PASSWORD}

      --maxmemory 512mb

      --maxmemory-policy allkeys-lru

      --save 60 1000

      --appendonly yes

    volumes:
      - redis_data:/data

    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]

      interval: 10s

      timeout: 3s

      retries: 5

    networks:
      - infra-network

  # MinIO for object storage

  minio:
    image: bitnami/minio:latest

    container_name: infra-minio

    restart: unless-stopped

    ports:
      - "9000:9000" # API

      - "9001:9001" # Console UI

    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}

      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}

      MINIO_DEFAULT_BUCKETS: ${MINIO_DEFAULT_BUCKETS:-uploads:public,private:none}

      MINIO_BROWSER_REDIRECT_URL: http://localhost:9001

    volumes:
      - minio_data:/data

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]

      interval: 30s

      timeout: 10s

      retries: 3

    networks:
      - infra-network

  # Your application

  app:
    build: .

    container_name: infra-app

    restart: unless-stopped

    ports:
      - "3000:3000"

    environment:
      NODE_ENV: production

      REDIS_HOST: redis

      REDIS_PORT: 6379

      REDIS_PASSWORD: ${REDIS_PASSWORD}

      S3_ENDPOINT: minio

      S3_PORT: 9000

      S3_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}

      S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin}

      S3_USE_SSL: false

    depends_on:
      redis:
        condition: service_healthy

      minio:
        condition: service_healthy

    networks:
      - infra-network

  # Worker process for background jobs

  worker:
    build: .

    container_name: infra-worker

    restart: unless-stopped

    command: node dist/worker.js

    environment:
      NODE_ENV: production

      REDIS_HOST: redis

      REDIS_PORT: 6379

      REDIS_PASSWORD: ${REDIS_PASSWORD}

      S3_ENDPOINT: minio

      S3_PORT: 9000

      S3_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}

      S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin}

    depends_on:
      - redis

      - minio

    networks:
      - infra-network

volumes:
  redis_data:
    driver: local

  minio_data:
    driver: local

networks:
  infra-network:
    driver: bridge
```

Create a `.env` file:

```env

# Redis

REDIS_PASSWORD=your-secure-redis-password



# MinIO

MINIO_ROOT_USER=admin

MINIO_ROOT_PASSWORD=your-secure-minio-password

MINIO_DEFAULT_BUCKETS=uploads:public,backups:none,private:none

```

Start services:

```bash

docker-compose up -d

```

### Kubernetes Deployment

#### Redis StatefulSet

```yaml
# k8s/redis-statefulset.yaml

apiVersion: apps/v1

kind: StatefulSet

metadata:
  name: redis

spec:
  serviceName: redis

  replicas: 1

  selector:
    matchLabels:
      app: redis

  template:
    metadata:
      labels:
        app: redis

    spec:
      containers:
        - name: redis

          image: redis:7-alpine

          ports:
            - containerPort: 6379

          command:
            - redis-server

            - --requirepass

            - $(REDIS_PASSWORD)

            - --maxmemory

            - 2gb

            - --maxmemory-policy

            - allkeys-lru

          env:
            - name: REDIS_PASSWORD

              valueFrom:
                secretKeyRef:
                  name: redis-secret

                  key: password

          volumeMounts:
            - name: redis-data

              mountPath: /data

          resources:
            requests:
              memory: "256Mi"

              cpu: "100m"

            limits:
              memory: "2Gi"

              cpu: "1000m"

          livenessProbe:
            exec:
              command:
                - redis-cli

                - ping

            initialDelaySeconds: 30

            periodSeconds: 10

          readinessProbe:
            exec:
              command:
                - redis-cli

                - ping

            initialDelaySeconds: 5

            periodSeconds: 5

  volumeClaimTemplates:
    - metadata:
        name: redis-data

      spec:
        accessModes: ["ReadWriteOnce"]

        resources:
          requests:
            storage: 10Gi

---
apiVersion: v1

kind: Service

metadata:
  name: redis

spec:
  ports:
    - port: 6379

  clusterIP: None

  selector:
    app: redis
```

#### MinIO StatefulSet

```yaml
# k8s/minio-statefulset.yaml

apiVersion: apps/v1

kind: StatefulSet

metadata:
  name: minio

spec:
  serviceName: minio

  replicas: 1

  selector:
    matchLabels:
      app: minio

  template:
    metadata:
      labels:
        app: minio

    spec:
      containers:
        - name: minio

          image: bitnami/minio:latest

          ports:
            - containerPort: 9000

              name: api

            - containerPort: 9001

              name: console

          env:
            - name: MINIO_ROOT_USER

              valueFrom:
                secretKeyRef:
                  name: minio-secret

                  key: root-user

            - name: MINIO_ROOT_PASSWORD

              valueFrom:
                secretKeyRef:
                  name: minio-secret

                  key: root-password

            - name: MINIO_DEFAULT_BUCKETS

              value: "uploads:public,private:none"

          volumeMounts:
            - name: minio-data

              mountPath: /data

          resources:
            requests:
              memory: "512Mi"

              cpu: "250m"

            limits:
              memory: "2Gi"

              cpu: "1000m"

          livenessProbe:
            httpGet:
              path: /minio/health/live

              port: 9000

            initialDelaySeconds: 30

            periodSeconds: 10

          readinessProbe:
            httpGet:
              path: /minio/health/ready

              port: 9000

            initialDelaySeconds: 10

            periodSeconds: 5

  volumeClaimTemplates:
    - metadata:
        name: minio-data

      spec:
        accessModes: ["ReadWriteOnce"]

        resources:
          requests:
            storage: 50Gi

---
apiVersion: v1

kind: Service

metadata:
  name: minio

spec:
  ports:
    - port: 9000

      name: api

    - port: 9001

      name: console

  selector:
    app: minio
```

#### Application Deployment

```yaml
# k8s/app-deployment.yaml

apiVersion: apps/v1

kind: Deployment

metadata:
  name: app

spec:
  replicas: 3

  selector:
    matchLabels:
      app: myapp

  template:
    metadata:
      labels:
        app: myapp

    spec:
      containers:
        - name: app

          image: myapp:latest

          ports:
            - containerPort: 3000

          env:
            - name: NODE_ENV

              value: "production"

            - name: REDIS_HOST

              value: "redis"

            - name: REDIS_PORT

              value: "6379"

            - name: REDIS_PASSWORD

              valueFrom:
                secretKeyRef:
                  name: redis-secret

                  key: password

            - name: S3_ENDPOINT

              value: "minio"

            - name: S3_PORT

              value: "9000"

            - name: S3_ACCESS_KEY

              valueFrom:
                secretKeyRef:
                  name: minio-secret

                  key: root-user

            - name: S3_SECRET_KEY

              valueFrom:
                secretKeyRef:
                  name: minio-secret

                  key: root-password

          resources:
            requests:
              memory: "256Mi"

              cpu: "100m"

            limits:
              memory: "512Mi"

              cpu: "500m"

          livenessProbe:
            httpGet:
              path: /health

              port: 3000

            initialDelaySeconds: 30

            periodSeconds: 10

          readinessProbe:
            httpGet:
              path: /ready

              port: 3000

            initialDelaySeconds: 10

            periodSeconds: 5

---
apiVersion: v1

kind: Service

metadata:
  name: app

spec:
  type: LoadBalancer

  ports:
    - port: 80

      targetPort: 3000

  selector:
    app: myapp
```

#### Create Secrets

```bash

# Redis secret

kubectl create secret generic redis-secret \

  --from-literal=password=your-secure-redis-password



# MinIO secret

kubectl create secret generic minio-secret \

  --from-literal=root-user=admin \

  --from-literal=root-password=your-secure-minio-password

```

#### Deploy

```bash

kubectl apply -f k8s/redis-statefulset.yaml

kubectl apply -f k8s/minio-statefulset.yaml

kubectl apply -f k8s/app-deployment.yaml

```

---

## Cloud Provider Integration

### AWS (Amazon Web Services)

#### Using ElastiCache for Redis

```typescript
// src/config/infra.ts

import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host:
      process.env.ELASTICACHE_ENDPOINT || "your-cluster.cache.amazonaws.com",

    port: 6379,

    password: process.env.REDIS_PASSWORD,

    // Enable TLS for ElastiCache in-transit encryption

    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  },

  storage: {
    // Use S3

    endPoint: "s3.amazonaws.com",

    accessKey: process.env.AWS_ACCESS_KEY_ID!,

    secretKey: process.env.AWS_SECRET_ACCESS_KEY!,

    region: process.env.AWS_REGION || "us-east-1",

    useSSL: true,
  },
});
```

Environment variables:

```env

# AWS ElastiCache Redis

ELASTICACHE_ENDPOINT=your-cluster.cache.amazonaws.com

REDIS_PASSWORD=your-password

REDIS_TLS=true



# AWS S3

AWS_ACCESS_KEY_ID=your-access-key

AWS_SECRET_ACCESS_KEY=your-secret-key

AWS_REGION=us-east-1

```

#### IAM Role for EC2/ECS

If running on EC2 or ECS, use IAM roles instead of access keys:

```typescript
import { fromEnv } from "@aws-sdk/credential-provider-env";

import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host: process.env.ELASTICACHE_ENDPOINT!,

    port: 6379,
  },

  storage: {
    endPoint: "s3.amazonaws.com",

    region: "us-east-1",

    useSSL: true,

    // Credentials will be automatically retrieved from IAM role

    accessKey: "", // Not needed with IAM role

    secretKey: "", // Not needed with IAM role
  },
});
```

### Google Cloud Platform (GCP)

#### Using Memorystore for Redis

```typescript
import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host: process.env.MEMORYSTORE_HOST || "10.0.0.3",

    port: 6379,

    // Memorystore doesn't use password by default
  },

  storage: {
    // Use Google Cloud Storage (S3-compatible via XML API)

    endPoint: "storage.googleapis.com",

    accessKey: process.env.GCS_ACCESS_KEY!,

    secretKey: process.env.GCS_SECRET_KEY!,

    useSSL: true,
  },
});
```

### Azure

#### Using Azure Cache for Redis

```typescript
import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host: process.env.AZURE_REDIS_HOST || "your-cache.redis.cache.windows.net",

    port: 6380, // Azure uses SSL port

    password: process.env.AZURE_REDIS_KEY,

    tls: {}, // Azure requires TLS
  },

  storage: {
    // Use Azure Blob Storage (S3-compatible)

    endPoint: process.env.AZURE_STORAGE_ENDPOINT!,

    accessKey: process.env.AZURE_STORAGE_ACCOUNT!,

    secretKey: process.env.AZURE_STORAGE_KEY!,

    useSSL: true,
  },
});
```

### DigitalOcean

#### Using Managed Redis

```typescript
import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host:
      process.env.DO_REDIS_HOST ||
      "your-redis-do-user-123-0.db.ondigitalocean.com",

    port: 25061,

    password: process.env.DO_REDIS_PASSWORD,

    tls: {}, // DigitalOcean requires TLS
  },

  storage: {
    // Use Spaces (S3-compatible)

    endPoint: process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com",

    accessKey: process.env.DO_SPACES_KEY!,

    secretKey: process.env.DO_SPACES_SECRET!,

    useSSL: true,
  },
});
```

### Cloudflare

#### Using Cloudflare R2

```typescript
import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    // Use external Redis provider (Upstash, Redis Labs, etc.)

    host: process.env.REDIS_HOST!,

    port: 6379,

    password: process.env.REDIS_PASSWORD,
  },

  storage: {
    // Use Cloudflare R2 (S3-compatible)

    endPoint:
      process.env.R2_ENDPOINT || "your-account-id.r2.cloudflarestorage.com",

    accessKey: process.env.R2_ACCESS_KEY_ID!,

    secretKey: process.env.R2_SECRET_ACCESS_KEY!,

    useSSL: true,
  },
});
```

### Upstash (Serverless Redis)

Perfect for serverless deployments:

```typescript
import { initConfig } from "@omed0/infra-kit";

initConfig({
  redis: {
    host: process.env.UPSTASH_REDIS_HOST || "your-redis.upstash.io",

    port: 6379,

    password: process.env.UPSTASH_REDIS_PASSWORD,

    tls: {}, // Upstash requires TLS
  },

  storage: {
    // Use any S3-compatible storage

    endPoint: "s3.amazonaws.com",

    accessKey: process.env.AWS_ACCESS_KEY_ID!,

    secretKey: process.env.AWS_SECRET_ACCESS_KEY!,

    useSSL: true,
  },
});
```

---

## Production Best Practices

### 1. Environment Configuration

Use environment-specific configuration:

```typescript
// src/config/infra.ts

import { initConfig } from "@omed0/infra-kit";

const isDev = process.env.NODE_ENV === "development";

const isProd = process.env.NODE_ENV === "production";

export function initInfra() {
  initConfig({
    redis: {
      host: process.env.REDIS_HOST!,

      port: parseInt(process.env.REDIS_PORT || "6379"),

      password: process.env.REDIS_PASSWORD,

      db: parseInt(process.env.REDIS_DB || "0"),

      // Production settings

      maxRetriesPerRequest: null,

      enableReadyCheck: false,

      lazyConnect: false,

      // Connection pool

      ...(isProd && {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);

          return delay;
        },
      }),
    },

    storage: {
      endPoint: process.env.S3_ENDPOINT!,

      port: process.env.S3_PORT ? parseInt(process.env.S3_PORT) : undefined,

      accessKey: process.env.S3_ACCESS_KEY!,

      secretKey: process.env.S3_SECRET_KEY!,

      useSSL: isProd, // Always use SSL in production

      region: process.env.S3_REGION,
    },
  });
}
```

### 2. Health Checks

```typescript
// src/health.ts

import { getCacheClient } from "@omed0/infra-kit";

import { getStorageClient } from "@omed0/infra-kit/storage";

export async function healthCheck() {
  const checks = {
    redis: false,

    storage: false,
  };

  try {
    const redis = getCacheClient();

    await redis.ping();

    checks.redis = true;
  } catch (error) {
    console.error("Redis health check failed:", error);
  }

  try {
    const storage = getStorageClient();

    await storage.listBuckets();

    checks.storage = true;
  } catch (error) {
    console.error("Storage health check failed:", error);
  }

  const healthy = checks.redis && checks.storage;

  return {
    status: healthy ? "healthy" : "unhealthy",

    checks,

    timestamp: new Date().toISOString(),
  };
}

// Express route

app.get("/health", async (req, res) => {
  const health = await healthCheck();

  res.status(health.status === "healthy" ? 200 : 503).json(health);
});
```

### 3. Graceful Shutdown

```typescript
// src/shutdown.ts

import { disconnect } from "@omed0/infra-kit";

import { closeAll as closeQueues } from "@omed0/infra-kit/queue";

import { closeEventBus } from "@omed0/infra-kit/events";

let isShuttingDown = false;

export async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new requests

    if (server) {
      server.close(() => {
        console.log("HTTP server closed");
      });
    }

    // Close all queue connections

    await closeQueues();

    console.log("Queues closed");

    // Close event bus

    await closeEventBus();

    console.log("Event bus closed");

    // Disconnect from Redis and cleanup

    await disconnect();

    console.log("Infrastructure disconnected");

    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);

    process.exit(1);
  }
}

// Handle signals

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);

  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);

  gracefulShutdown("unhandledRejection");
});
```

### 4. Worker Process Separation

Separate web and worker processes:

```typescript
// src/worker.ts

import { initInfra } from "./config/infra";

import { processJobs } from "@omed0/infra-kit/queue";

initInfra();

// Start all workers

processJobs(
  "emails",

  async (job) => {
    // Email processing
  },

  { concurrency: 5 }
);

processJobs(
  "images",

  async (job) => {
    // Image processing
  },

  { concurrency: 2 }
);

console.log("Workers started");

// Graceful shutdown

import { gracefulShutdown } from "./shutdown";

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
```

### 5. Connection Pooling

Configure appropriate connection pool sizes:

```typescript
initConfig({
  redis: {
    host: "redis",

    port: 6379,

    // For high-throughput applications

    maxRetriesPerRequest: null,

    enableReadyCheck: false,

    // Optimize for your workload

    connectTimeout: 10000,

    keepAlive: 30000,
  },
});
```

---

## Monitoring & Observability

### Metrics Collection

```typescript
// src/metrics.ts

import { getQueueMetrics } from "@omed0/infra-kit/queue";

import { getCacheClient } from "@omed0/infra-kit";

export async function collectMetrics() {
  const metrics: any = {
    timestamp: Date.now(),

    redis: {},

    queues: {},
  };

  // Redis metrics

  try {
    const redis = getCacheClient();

    const info = await redis.info("stats");

    metrics.redis = parseRedisInfo(info);
  } catch (error) {
    console.error("Error collecting Redis metrics:", error);
  }

  // Queue metrics

  try {
    const emailMetrics = await getQueueMetrics("emails");

    metrics.queues.emails = emailMetrics;
  } catch (error) {
    console.error("Error collecting queue metrics:", error);
  }

  return metrics;
}

function parseRedisInfo(info: string) {
  const lines = info.split("\r\n");

  const metrics: any = {};

  for (const line of lines) {
    if (line.includes(":")) {
      const [key, value] = line.split(":");

      metrics[key] = value;
    }
  }

  return metrics;
}

// Express endpoint

app.get("/metrics", async (req, res) => {
  const metrics = await collectMetrics();

  res.json(metrics);
});
```

### Logging

```typescript
// src/logger.ts

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  transport: {
    target: "pino-pretty",

    options: {
      colorize: true,
    },
  },
});

// Log infrastructure events

import { processJobs } from "@omed0/infra-kit/queue";

processJobs("emails", async (job) => {
  logger.info({ jobId: job.id, data: job.data }, "Processing email job");

  try {
    // Process job

    logger.info({ jobId: job.id }, "Email sent successfully");
  } catch (error) {
    logger.error({ jobId: job.id, error }, "Failed to send email");

    throw error;
  }
});
```

---

## Security Considerations

### 1. Secure Credentials

Never commit credentials to version control:

```bash

# .gitignore

.env

.env.local

.env.production

secrets/

```

Use secret management:

```typescript
// AWS Secrets Manager

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

async function getRedisPassword() {
  const client = new SecretsManagerClient({ region: "us-east-1" });

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: "prod/redis/password" })
  );

  return response.SecretString;
}
```

### 2. Network Security

Use VPC/Private networks:

```yaml
# docker-compose.yml with internal network

networks:
  internal:
    driver: bridge

    internal: true # No external access

  external:
    driver: bridge

services:
  redis:
    networks:
      - internal # Only internal access

  app:
    networks:
      - internal

      - external # Can access internet
```

### 3. TLS/SSL

Always use TLS in production:

```typescript
initConfig({
  redis: {
    host: "redis.example.com",

    port: 6380,

    password: process.env.REDIS_PASSWORD,

    tls: {
      rejectUnauthorized: true,

      ca: fs.readFileSync("/path/to/ca.crt"),
    },
  },

  storage: {
    endPoint: "s3.example.com",

    useSSL: true,

    accessKey: process.env.S3_ACCESS_KEY!,

    secretKey: process.env.S3_SECRET_KEY!,
  },
});
```

### 4. Rate Limiting

Protect your infrastructure:

```typescript
import { checkRateLimit } from "@omed0/infra-kit/rate-limit";

app.use(async (req, res, next) => {
  const result = await checkRateLimit(req.ip, {
    limit: 1000,

    window: 3600,

    key: "global",
  });

  if (!result.allowed) {
    return res.status(429).json({ error: "Too many requests" });
  }

  next();
});
```

---

For more information, see:

- [TypeScript Backend Integration](./TYPESCRIPT_BACKEND.md)
