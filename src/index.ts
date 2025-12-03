/**
 * @infra-kit/core - Self-hosted infrastructure SDK
 * 
 * A comprehensive TypeScript/JavaScript SDK for self-hosted services
 * including queue management, caching, storage, events, rate limiting,
 * distributed locking, and session management.
 * 
 * @example
 * ```typescript
 * import { initConfig } from '@infra-kit/core';
 * 
 * // Initialize
 * initConfig({
 *   redis: {
 *     host: 'localhost',
 *     port: 6379
 *   },
 *   storage: {
 *     endPoint: 'localhost',
 *     port: 9000,
 *     accessKey: 'minioadmin',
 *     secretKey: 'minioadmin'
 *   }
 * });
 * 
 * // Use modules
 * import { addJob } from '@infra-kit/core/queue';
 * import { setCache } from '@infra-kit/core/cache';
 * import { uploadFile } from '@infra-kit/core/storage';
 * ```
 */

// Configuration
export {
    initConfig,
    initFromEnv,
    getConfig,
    getCacheClient,
    disconnect,
    type Config,
    type RedisConfig,
    type StorageConfig,
} from './config.js';

// Re-export all modules for convenience
export * as queue from './queue/index.js';
export * as cache from './cache/index.js';
export * as storage from './storage/index.js';
export * as events from './events/index.js';
export * as rateLimit from './rate-limit/index.js';
export * as lock from './lock/index.js';
export * as session from './session/index.js';
