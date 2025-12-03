import { getCacheClient } from '../config.js';

export interface LockOptions {
    /** Lock TTL in milliseconds (default: 10000) */
    ttl?: number;
    /** Retry attempts (default: 0) */
    retries?: number;
    /** Retry delay in milliseconds (default: 100) */
    retryDelay?: number;
}

/**
 * Acquire a distributed lock
 * 
 * @param key - Lock key
 * @param options - Lock options
 * @returns Lock token (use for release) or null if failed
 * 
 * @example
 * ```typescript
 * import { acquireLock, releaseLock } from '@infra-kit/core/lock';
 * 
 * const token = await acquireLock('process:data', { ttl: 30000 });
 * if (token) {
 *   try {
 *     // Do critical work
 *   } finally {
 *     await releaseLock('process:data', token);
 *   }
 * }
 * ```
 */
export async function acquireLock(
    key: string,
    options: LockOptions = {}
): Promise<string | null> {
    if (!key || typeof key !== 'string') {
        throw new Error('Lock key must be a non-empty string');
    }

    const redis = getCacheClient();
    const lockKey = `lock:${key}`;
    const token = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const ttl = options.ttl || 10000;

    if (ttl < 1) {
        throw new Error('Lock TTL must be positive');
    };
    const retries = options.retries || 0;
    const retryDelay = options.retryDelay || 100;

    for (let i = 0; i <= retries; i++) {
        const result = await redis.set(lockKey, token, 'PX', ttl, 'NX');

        if (result === 'OK') {
            return token;
        }

        if (i < retries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    return null;
}

/**
 * Release a distributed lock
 * 
 * @param key - Lock key
 * @param token - Lock token from acquireLock
 * @returns True if released
 */
export async function releaseLock(key: string, token: string): Promise<boolean> {
    const redis = getCacheClient();
    const lockKey = `lock:${key}`;

    // Lua script to ensure we only delete our lock
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

    const result = await redis.eval(script, 1, lockKey, token);
    return result === 1;
}

/**
 * Extend a lock's TTL
 * 
 * @param key - Lock key
 * @param token - Lock token
 * @param ttl - New TTL in milliseconds
 * @returns True if extended
 */
export async function extendLock(
    key: string,
    token: string,
    ttl: number
): Promise<boolean> {
    const redis = getCacheClient();
    const lockKey = `lock:${key}`;

    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

    const result = await redis.eval(script, 1, lockKey, token, ttl);
    return result === 1;
}

/**
 * Execute function with lock
 * 
 * @param key - Lock key
 * @param fn - Function to execute
 * @param options - Lock options
 * @returns Function result
 * 
 * @example
 * ```typescript
 * import { withLock } from '@infra-kit/core/lock';
 * 
 * const result = await withLock('critical-section', async () => {
 *   // Critical work here
 *   return { success: true };
 * }, { ttl: 30000 });
 * ```
 */
export async function withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
): Promise<T> {
    const token = await acquireLock(key, options);

    if (!token) {
        throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
        return await fn();
    } finally {
        await releaseLock(key, token);
    }
}
