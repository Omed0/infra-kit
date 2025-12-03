import { getCacheClient } from '../config.js';

type EventHandler<T = any> = (data: T) => void | Promise<void>;

const subscribers = new Map<string, Set<EventHandler>>();

/**
 * Publish an event to a channel
 * 
 * @param channel - Event channel name
 * @param data - Event data (will be JSON serialized)
 * @returns Number of subscribers that received the message
 * 
 * @example
 * ```typescript
 * import { publish } from '@infra-kit/core/events';
 * 
 * await publish('user.created', {
 *   userId: '123',
 *   email: 'user@example.com'
 * });
 * ```
 */
export async function publish<T = any>(
    channel: string,
    data: T
): Promise<number> {
    if (!channel || typeof channel !== 'string') {
        throw new Error('Channel must be a non-empty string');
    }
    const redis = getCacheClient();
    const payload = JSON.stringify(data);
    return await redis.publish(channel, payload);
}

/**
 * Subscribe to events on a channel
 * 
 * @param channel - Event channel name (supports wildcards: *, ?)
 * @param handler - Event handler function
 * @returns Unsubscribe function
 * 
 * @example
 * ```typescript
 * import { subscribe } from '@infra-kit/core/events';
 * 
 * // Exact channel
 * const unsubscribe = await subscribe('user.created', (data) => {
 *   console.log('New user:', data);
 * });
 * 
 * // Pattern matching
 * await subscribe('user.*', (data) => {
 *   console.log('User event:', data);
 * });
 * 
 * // Later: unsubscribe()
 * ```
 */
export async function subscribe<T = any>(
    channel: string,
    handler: EventHandler<T>
): Promise<() => void> {
    if (!channel || typeof channel !== 'string') {
        throw new Error('Channel must be a non-empty string');
    }
    if (typeof handler !== 'function') {
        throw new Error('Handler must be a function');
    }

    // Store handler for this channel
    if (!subscribers.has(channel)) {
        subscribers.set(channel, new Set());
    }
    subscribers.get(channel)!.add(handler);

    // Create subscriber client if needed
    await ensureSubscriberClient();

    // Subscribe using pattern or exact match
    const isPattern = channel.includes('*') || channel.includes('?');

    if (isPattern) {
        await subscriberClient!.psubscribe(channel);
    } else {
        await subscriberClient!.subscribe(channel);
    }

    // Return unsubscribe function
    return () => {
        const handlers = subscribers.get(channel);
        if (handlers) {
            handlers.delete(handler);

            // If no more handlers, unsubscribe from Redis
            if (handlers.size === 0) {
                subscribers.delete(channel);
                if (isPattern) {
                    subscriberClient?.punsubscribe(channel);
                } else {
                    subscriberClient?.unsubscribe(channel);
                }
            }
        }
    };
}

/**
 * Subscribe to multiple channels at once
 * 
 * @param channels - Array of channel names
 * @param handler - Event handler function
 * @returns Unsubscribe function
 * 
 * @example
 * ```typescript
 * import { subscribeMany } from '@infra-kit/core/events';
 * 
 * const unsubscribe = await subscribeMany(
 *   ['user.created', 'user.updated', 'user.deleted'],
 *   (data) => {
 *     console.log('User event:', data);
 *   }
 * );
 * ```
 */
export async function subscribeMany<T = any>(
    channels: string[],
    handler: EventHandler<T>
): Promise<() => void> {
    const unsubscribers = await Promise.all(
        channels.map(channel => subscribe(channel, handler))
    );

    return () => {
        unsubscribers.forEach(unsub => unsub());
    };
}

/**
 * Unsubscribe from a channel (removes all handlers)
 * 
 * @param channel - Event channel name
 * 
 * @example
 * ```typescript
 * import { unsubscribe } from '@infra-kit/core/events';
 * 
 * await unsubscribe('user.created');
 * ```
 */
export async function unsubscribe(channel: string): Promise<void> {
    subscribers.delete(channel);

    const isPattern = channel.includes('*') || channel.includes('?');

    if (subscriberClient) {
        if (isPattern) {
            await subscriberClient.punsubscribe(channel);
        } else {
            await subscriberClient.unsubscribe(channel);
        }
    }
}

/**
 * Unsubscribe from all channels
 * 
 * @example
 * ```typescript
 * import { unsubscribeAll } from '@infra-kit/core/events';
 * 
 * await unsubscribeAll();
 * ```
 */
export async function unsubscribeAll(): Promise<void> {
    subscribers.clear();

    if (subscriberClient) {
        await subscriberClient.unsubscribe();
        await subscriberClient.punsubscribe();
    }
}

/**
 * Get active subscriber count for a channel
 * 
 * @param channel - Event channel name
 * @returns Number of active subscribers
 * 
 * @example
 * ```typescript
 * import { getSubscriberCount } from '@infra-kit/core/events';
 * 
 * const count = await getSubscriberCount('user.created');
 * console.log(`${count} subscribers`);
 * ```
 */
export async function getSubscriberCount(channel: string): Promise<number> {
    const redis = getCacheClient();
    const result = await redis.pubsub('NUMSUB', channel);
    // Result is [channel, count]
    return result[1] as number || 0;
}

/**
 * Close event bus and cleanup
 * 
 * @example
 * ```typescript
 * import { closeEventBus } from '@infra-kit/core/events';
 * 
 * await closeEventBus();
 * ```
 */
export async function closeEventBus(): Promise<void> {
    await unsubscribeAll();

    if (subscriberClient) {
        await subscriberClient.quit();
        subscriberClient = null;
    }
}

// Internal subscriber client (separate from main client for pub/sub)
let subscriberClient: any = null;

async function ensureSubscriberClient() {
    if (!subscriberClient) {
        const redis = getCacheClient();
        subscriberClient = redis.duplicate();

        subscriberClient.on('error', (err) => {
            console.error('Subscriber client error:', err);
        });

        // Handle incoming messages
        subscriberClient.on('message', (channel: string, message: string) => {
            handleMessage(channel, message);
        });

        // Handle pattern messages
        subscriberClient.on('pmessage', (pattern: string, _channel: string, message: string) => {
            handleMessage(pattern, message);
        });

        // Connect the subscriber client
        if (subscriberClient.status === 'wait') {
            await subscriberClient.connect();
        }
    }
}

function handleMessage(channel: string, message: string) {
    const handlers = subscribers.get(channel);

    if (!handlers || handlers.size === 0) return;

    try {
        const data = JSON.parse(message);

        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in event handler for channel ${channel}:`, error);
            }
        });
    } catch (error) {
        console.error(`Failed to parse event message on channel ${channel}:`, error);
    }
}
