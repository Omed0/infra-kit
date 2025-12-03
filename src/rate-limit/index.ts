import { getCacheClient } from '../config.js';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

export interface RateLimitOptions {
    limit: number;
    window: number;
    key: string;
}

/**
 * Check and consume rate limit using sliding window
 * 
 * @example
 * ```typescript
 * import { checkRateLimit } from '@infra-kit/core/rate-limit';
 * 
 * const result = await checkRateLimit('user:123', {
 *   limit: 100, window: 60, key: 'api'
 * });
 * ```
 */
export async function checkRateLimit(
    identifier: string,
    options: RateLimitOptions
): Promise<RateLimitResult> {
    if (!identifier || typeof identifier !== 'string') {
        throw new Error('Identifier must be a non-empty string');
    }
    if (!options.key || typeof options.key !== 'string') {
        throw new Error('Options.key must be a non-empty string');
    }
    if (typeof options.limit !== 'number' || options.limit < 1) {
        throw new Error('Options.limit must be a positive number');
    }
    if (typeof options.window !== 'number' || options.window < 1) {
        throw new Error('Options.window must be a positive number');
    }

    const redis = getCacheClient();
    const key = `ratelimit:${options.key}:${identifier}`;
    const now = Date.now();
    const windowStart = now - (options.window * 1000);

    // Use Lua script to ensure atomic operation
    const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowStart = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local window = tonumber(ARGV[4])
        
        redis.call('zremrangebyscore', key, 0, windowStart)
        local count = redis.call('zcard', key)
        
        if count < limit then
            redis.call('zadd', key, now, now .. '-' .. math.random())
            redis.call('expire', key, window)
            return {1, count}
        else
            return {0, count}
        end
    `;

    const result = await redis.eval(script, 1, key, now, windowStart, options.limit, options.window) as [number, number];
    const allowed = result[0] === 1;
    const count = result[1];

    const remaining = Math.max(0, options.limit - count - (allowed ? 1 : 0));
    const resetAt = now + (options.window * 1000);

    if (!allowed) {
        const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTimestamp = oldestRequest[1] ? parseInt(oldestRequest[1]) : now;
        const retryAfter = Math.max(0, (oldestTimestamp + (options.window * 1000)) - now);

        return { allowed: false, remaining: 0, resetAt, retryAfter };
    }

    return { allowed: true, remaining, resetAt };
}

/**
 * Reset rate limit
 */
export async function resetRateLimit(identifier: string, key: string): Promise<void> {
    const redis = getCacheClient();
    await redis.del(`ratelimit:${key}:${identifier}`);
}

/**
 * Create a rate limiter with preset options
 */
export function createRateLimiter(defaultOptions: RateLimitOptions) {
    return (identifier: string, overrides?: Partial<RateLimitOptions>) => {
        return checkRateLimit(identifier, { ...defaultOptions, ...overrides });
    };
}
