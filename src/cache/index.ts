import { getCacheClient } from '../config.js';
import type { Redis } from 'ioredis';

// Export generic types/aliases
export type CacheClient = Redis;

export interface CacheOptions {
    /** Time to live in seconds */
    ttl?: number;
    /** Namespace prefix for keys */
    namespace?: string;
}

/**
 * Set a value in cache
 */
export async function setCache<T = any>(
    key: string,
    value: T,
    ttl?: number
): Promise<boolean> {
    if (!key || typeof key !== 'string') {
        throw new Error('Cache key must be a non-empty string');
    }
    if (ttl !== undefined && (typeof ttl !== 'number' || ttl < 0)) {
        throw new Error('TTL must be a non-negative number');
    }

    const redis = getCacheClient();
    const serialized = JSON.stringify(value);

    if (ttl) {
        const result = await redis.setex(key, ttl, serialized);
        return result === 'OK';
    }

    const result = await redis.set(key, serialized);
    return result === 'OK';
}

/**
 * Get a value from cache
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
    const redis = getCacheClient();
    const value = await redis.get(key);

    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return value as T;
    }
}

/**
 * Delete a value from cache
 */
export async function deleteCache(key: string | string[]): Promise<number> {
    const redis = getCacheClient();
    const keys = Array.isArray(key) ? key : [key];
    return await redis.del(...keys);
}

/**
 * Check if a key exists in cache
 */
export async function hasCache(key: string): Promise<boolean> {
    const redis = getCacheClient();
    const exists = await redis.exists(key);
    return exists === 1;
}

/**
 * Set expiration time for a key
 */
export async function expireCache(key: string, ttl: number): Promise<boolean> {
    const redis = getCacheClient();
    const result = await redis.expire(key, ttl);
    return result === 1;
}

/**
 * Get remaining TTL for a key
 */
export async function getTTL(key: string): Promise<number> {
    const redis = getCacheClient();
    return await redis.ttl(key);
}

/**
 * Increment a numeric value
 */
export async function increment(key: string, amount: number = 1): Promise<number> {
    const redis = getCacheClient();
    return await redis.incrby(key, amount);
}

/**
 * Decrement a numeric value
 */
export async function decrement(key: string, amount: number = 1): Promise<number> {
    const redis = getCacheClient();
    return await redis.decrby(key, amount);
}

/**
 * Get multiple values at once
 */
export async function getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    const redis = getCacheClient();
    const values = await redis.mget(...keys);

    return values.map(v => {
        if (!v) return null;
        try {
            return JSON.parse(v) as T;
        } catch {
            return v as T;
        }
    });
}

/**
 * Set multiple values at once
 */
export async function setMany(entries: Record<string, any>): Promise<boolean> {
    const redis = getCacheClient();
    const pipeline = redis.pipeline();

    for (const [key, value] of Object.entries(entries)) {
        pipeline.set(key, JSON.stringify(value));
    }

    await pipeline.exec();
    return true;
}

/**
 * Delete all keys matching a pattern
 */
export async function deletePattern(pattern: string): Promise<number> {
    if (!pattern || typeof pattern !== 'string' || pattern === '*') {
        throw new Error('Pattern must be a specific non-empty string, not "*"');
    }

    const redis = getCacheClient();
    const keys = await redis.keys(pattern);

    if (keys.length === 0) return 0;

    // Batch delete in chunks to avoid blocking Redis
    const chunkSize = 100;
    let deleted = 0;
    for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        deleted += await redis.del(...chunk);
    }

    return deleted;
}

/**
 * Clear all cache (use with caution!)
 */
export async function clearCache(): Promise<void> {
    const redis = getCacheClient();
    await redis.flushdb();
}
