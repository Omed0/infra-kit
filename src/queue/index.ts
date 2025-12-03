import { Queue, Worker, type JobsOptions, type Processor, type Job, type ConnectionOptions, type QueueOptions, type WorkerOptions } from 'bullmq';
import { getCacheClient } from '../config.js';

// Export actual classes and types
export { Queue, Worker, type Job, type ConnectionOptions, type QueueOptions, type WorkerOptions };
export type JobQueue = Queue;
export type JobWorker = Worker;
export type JobOptions = JobsOptions;
export type JobProcessor<T = any, R = any> = Processor<T, R>;

// Internal maps to track queues and workers
const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

function getOrCreateQueue(queueName: string): Queue {
    if (!queues.has(queueName)) {
        const connection = getCacheClient();
        const queue = new Queue(queueName, { connection });
        queues.set(queueName, queue);
    }
    return queues.get(queueName)!;
}

/**
 * Add a job to a queue
 * 
 * @param queueName - Name of the queue
 * @param jobName - Name/type of the job
 * @param data - Job data payload
 * @param options - Job options (delay, priority, etc.)
 * @returns Job instance
 * 
 * @example
 * ```typescript
 * import { addJob } from '@infra-kit/core/queue';
 * 
 * await addJob('emails', 'send-welcome', {
 *   to: 'user@example.com',
 *   subject: 'Welcome!'
 * }, {
 *   delay: 5000, // 5 seconds
 *   attempts: 3
 * });
 * ```
 */
export async function addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobsOptions
): Promise<Job<T>> {
    if (!queueName || typeof queueName !== 'string') {
        throw new Error('Queue name must be a non-empty string');
    }
    if (!jobName || typeof jobName !== 'string') {
        throw new Error('Job name must be a non-empty string');
    }
    const queue = getOrCreateQueue(queueName);
    return await queue.add(jobName, data, options);
}

/**
 * Add multiple jobs in bulk
 * 
 * @param queueName - Name of the queue
 * @param jobs - Array of jobs to add
 * @returns Array of job instances
 * 
 * @example
 * ```typescript
 * import { addBulkJobs } from '@infra-kit/core/queue';
 * 
 * await addBulkJobs('emails', [
 *   { name: 'welcome', data: { to: 'user1@example.com' } },
 *   { name: 'welcome', data: { to: 'user2@example.com' } },
 * ]);
 * ```
 */
export async function addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ name: string; data: T; opts?: JobsOptions }>
): Promise<Job<T>[]> {
    const queue = getOrCreateQueue(queueName);
    return await queue.addBulk(jobs);
}

/**
 * Schedule a recurring job
 * 
 * @param queueName - Name of the queue
 * @param jobName - Name/type of the job
 * @param data - Job data payload
 * @param repeatOptions - Cron pattern or repeat configuration
 * @returns Job instance
 * 
 * @example
 * ```typescript
 * import { scheduleJob } from '@infra-kit/core/queue';
 * 
 * // Run every day at midnight
 * await scheduleJob('backups', 'database-backup', {}, {
 *   pattern: '0 0 * * *'
 * });
 * ```
 */
export async function scheduleJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    repeatOptions: { pattern?: string; every?: number; limit?: number }
): Promise<Job<T>> {
    const queue = getOrCreateQueue(queueName);
    return await queue.add(jobName, data, {
        repeat: repeatOptions,
    });
}

/**
 * Remove a repeatable job
 * 
 * @param queueName - Name of the queue
 * @param jobKey - Job key or repeat options
 * @returns True if removed
 * 
 * @example
 * ```typescript
 * import { removeRepeatableJob } from '@infra-kit/core/queue';
 * 
 * await removeRepeatableJob('backups', {
 *   pattern: '0 0 * * *'
 * });
 * ```
 */
export async function removeRepeatableJob(
    queueName: string,
    jobKey: string | { pattern?: string; every?: number }
): Promise<boolean> {
    const queue = getOrCreateQueue(queueName);
    if (typeof jobKey === 'string') {
        return await queue.removeJobScheduler(jobKey);
    }
    return await queue.removeJobScheduler(jobKey as any);
}

/**
 * Process jobs from a queue
 * 
 * @param queueName - Name of the queue
 * @param processor - Function to process jobs
 * @param options - Worker options (concurrency, etc.)
 * @returns Worker instance
 * 
 * @example
 * ```typescript
 * import { processJobs } from '@infra-kit/core/queue';
 * 
 * processJobs('emails', async (job) => {
 *   console.log('Processing:', job.data);
 *   // Send email logic
 *   return { sent: true };
 * }, {
 *   concurrency: 5
 * });
 * ```
 */
export function processJobs<T = any, R = any>(
    queueName: string,
    processor: Processor<T, R>,
    options?: { concurrency?: number; limiter?: any }
): Worker<T, R> {
    const connection = getCacheClient();

    const worker = new Worker<T, R>(queueName, processor, {
        connection,
        concurrency: options?.concurrency || 1,
        limiter: options?.limiter,
    });

    // Store worker for cleanup
    workers.set(queueName, worker);

    return worker;
}

/**
 * Get job by ID
 * 
 * @param queueName - Name of the queue
 * @param jobId - Job ID
 * @returns Job instance or null
 * 
 * @example
 * ```typescript
 * import { getJob } from '@infra-kit/core/queue';
 * 
 * const job = await getJob('emails', '123');
 * if (job) {
 *   console.log(job.data);
 * }
 * ```
 */
export async function getJob<T = any>(
    queueName: string,
    jobId: string
): Promise<Job<T> | null> {
    const queue = getOrCreateQueue(queueName);
    return await queue.getJob(jobId) as Job<T> | null;
}

/**
 * Get queue metrics
 * 
 * @param queueName - Name of the queue
 * @returns Queue counts and metrics
 * 
 * @example
 * ```typescript
 * import { getQueueMetrics } from '@infra-kit/core/queue';
 * 
 * const metrics = await getQueueMetrics('emails');
 * console.log('Waiting:', metrics.waiting);
 * console.log('Active:', metrics.active);
 * ```
 */
export async function getQueueMetrics(queueName: string) {
    const queue = getOrCreateQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}

/**
 * Close all queues and workers
 */
export async function closeAll() {
    await Promise.all([
        ...Array.from(queues.values()).map(q => q.close()),
        ...Array.from(workers.values()).map(w => w.close()),
    ]);
    queues.clear();
    workers.clear();
}

/**
 * Disconnect from Redis
 */
export async function disconnect() {
    await closeAll();
}
