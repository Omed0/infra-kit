import { z } from 'zod';
import Redis from 'ioredis';

export const RedisConfigSchema = z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    keyPrefix: z.string().optional(),
    maxRetriesPerRequest: z.number().nullable().default(null),
    enableReadyCheck: z.boolean().default(true),
    lazyConnect: z.boolean().default(false),
});

export const StorageConfigSchema = z.object({
    endPoint: z.string(),
    port: z.number().optional(),
    accessKey: z.string(),
    secretKey: z.string(),
    useSSL: z.boolean().default(false),
    region: z.string().optional(),
    bucket: z.string().optional(),
});

export const ConfigSchema = z.object({
    redis: RedisConfigSchema,
    storage: StorageConfigSchema.optional(),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

let globalConfig: Config | null = null;
let redisClient: Redis | null = null;

export function initConfig(config: Config): void {
    const validated = ConfigSchema.parse(config);
    globalConfig = validated;
    if (redisClient) {
        redisClient.disconnect();
    }
    redisClient = new Redis({ 
        ...validated.redis,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
    });
}

export function initFromEnv(): void {
    // Validate environment variables
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');
    const redisDb = parseInt(process.env.REDIS_DB || '0');

    if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
        throw new Error('Invalid REDIS_PORT: must be between 1 and 65535');
    }

    if (isNaN(redisDb) || redisDb < 0) {
        throw new Error('Invalid REDIS_DB: must be a non-negative integer');
    }

    const config: Config = {
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: redisPort,
            password: process.env.REDIS_PASSWORD,
            db: redisDb,
            keyPrefix: process.env.REDIS_KEY_PREFIX,
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false, // BullMQ manages connections
            lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
        },
    };

    if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
        const s3Port = process.env.S3_PORT ? parseInt(process.env.S3_PORT) : undefined;
        
        if (s3Port !== undefined && (isNaN(s3Port) || s3Port < 1 || s3Port > 65535)) {
            throw new Error('Invalid S3_PORT: must be between 1 and 65535');
        }

        config.storage = {
            endPoint: process.env.S3_ENDPOINT,
            port: s3Port,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
            useSSL: process.env.S3_USE_SSL === 'true',
            region: process.env.S3_REGION,
            bucket: process.env.S3_BUCKET,
        };
    }

    initConfig(config);
}

export function getConfig(): Config {
    if (!globalConfig) {
        throw new Error('Configuration not initialized. Call initConfig() first.');
    }
    return globalConfig;
}

export function getCacheClient(): Redis {
    if (!redisClient) {
        throw new Error('Redis client not initialized. Call initConfig() first.');
    }
    if (redisClient.status === 'wait') {
        redisClient.connect();
    }
    return redisClient;
}

export async function disconnect(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
    globalConfig = null;
}
