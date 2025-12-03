import { getCacheClient } from '../config.js';

export interface SessionData {
    [key: string]: any;
}

export interface SessionOptions {
    /** Session TTL in seconds (default: 86400 - 24 hours) */
    ttl?: number;
}

/**
 * Create or update a session
 * 
 * @param sessionId - Unique session identifier
 * @param data - Session data
 * @param options - Session options
 * 
 * @example
 * ```typescript
 * import { setSession } from '@infra-kit/core/session';
 * 
 * await setSession('sess_123', {
 *   userId: '456',
 *   email: 'user@example.com',
 *   roles: ['admin']
 * }, { ttl: 3600 });
 * ```
 */
export async function setSession(
    sessionId: string,
    data: SessionData,
    options: SessionOptions = {}
): Promise<void> {
    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Session ID must be a non-empty string');
    }
    if (!data || typeof data !== 'object') {
        throw new Error('Session data must be an object');
    }

    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    const ttl = options.ttl || 86400; // 24 hours default

    if (ttl < 1) {
        throw new Error('Session TTL must be positive');
    }

    await redis.setex(key, ttl, JSON.stringify(data));
}

/**
 * Get session data
 * 
 * @param sessionId - Session identifier
 * @returns Session data or null if not found
 * 
 * @example
 * ```typescript
 * import { getSession } from '@infra-kit/core/session';
 * 
 * const session = await getSession('sess_123');
 * if (session) {
 *   console.log(session.userId);
 * }
 * ```
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);

    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Update session data (merge with existing)
 * 
 * @param sessionId - Session identifier
 * @param data - Partial data to merge
 * @param options - Session options
 */
export async function updateSession(
    sessionId: string,
    data: Partial<SessionData>,
    options: SessionOptions = {}
): Promise<void> {
    const existing = await getSession(sessionId);

    if (!existing) {
        throw new Error(`Session not found: ${sessionId}`);
    }

    await setSession(sessionId, { ...existing, ...data }, options);
}

/**
 * Delete a session
 * 
 * @param sessionId - Session identifier
 */
export async function deleteSession(sessionId: string): Promise<void> {
    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    await redis.del(key);
}

/**
 * Check if session exists and is valid
 * 
 * @param sessionId - Session identifier
 */
export async function hasSession(sessionId: string): Promise<boolean> {
    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    const exists = await redis.exists(key);
    return exists === 1;
}

/**
 * Refresh session TTL
 * 
 * @param sessionId - Session identifier
 * @param ttl - New TTL in seconds
 */
export async function refreshSession(sessionId: string, ttl?: number): Promise<void> {
    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    const sessionTtl = ttl || 86400;

    await redis.expire(key, sessionTtl);
}

/**
 * Get session TTL
 * 
 * @param sessionId - Session identifier
 * @returns TTL in seconds, -1 if no expiration, -2 if doesn't exist
 */
export async function getSessionTTL(sessionId: string): Promise<number> {
    const redis = getCacheClient();
    const key = `session:${sessionId}`;
    return await redis.ttl(key);
}

/**
 * Delete all sessions matching a pattern
 * 
 * @param pattern - Pattern (e.g., 'user:123:*')
 */
export async function deleteSessionsByPattern(pattern: string): Promise<number> {
    const redis = getCacheClient();
    const keys = await redis.keys(`session:${pattern}`);

    if (keys.length === 0) return 0;

    return await redis.del(...keys);
}
