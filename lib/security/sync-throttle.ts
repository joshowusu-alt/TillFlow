/**
 * Rate limiter for the offline sync endpoint.
 * Allows 60 syncs per 60 seconds per user. Uses Upstash if configured,
 * falls back to in-memory for local dev.
 */

const inMemory = new Map<string, { count: number; resetAt: number }>();

export async function checkSyncRateLimit(userId: string): Promise<{
    blocked: boolean;
    retryAfterSeconds?: number;
}> {
    const key = `sync_rl:${userId}`;
    const windowMs = 60_000;
    const maxRequests = 60;
    const now = Date.now();

    // Try Upstash Redis first
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            const { Redis } = await import('@upstash/redis');
            const redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
            const count = await redis.incr(key);
            if (count === 1) {
                await redis.expire(key, 60);
            }
            if (count > maxRequests) {
                const ttl = await redis.ttl(key);
                return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : 60 };
            }
            return { blocked: false };
        } catch {
            // Fall through to in-memory
        }
    }

    // In-memory fallback
    const entry = inMemory.get(key);
    if (!entry || now > entry.resetAt) {
        inMemory.set(key, { count: 1, resetAt: now + windowMs });
        return { blocked: false };
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false };
}

/**
 * Rate limiter for the offline batch-sync endpoint.
 * Allows 10 syncs per 60 seconds per user.
 */
export async function checkBatchSyncRateLimit(userId: string): Promise<{
    blocked: boolean;
    retryAfterSeconds?: number;
}> {
    const key = `batch_sync_rl:${userId}`;
    const windowMs = 60_000;
    const maxRequests = 10;
    const now = Date.now();

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            const { Redis } = await import('@upstash/redis');
            const redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
            const count = await redis.incr(key);
            if (count === 1) {
                await redis.expire(key, 60);
            }
            if (count > maxRequests) {
                const ttl = await redis.ttl(key);
                return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : 60 };
            }
            return { blocked: false };
        } catch {
            // Fall through to in-memory
        }
    }

    const entry = inMemory.get(key);
    if (!entry || now > entry.resetAt) {
        inMemory.set(key, { count: 1, resetAt: now + windowMs });
        return { blocked: false };
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false };
}

/**
 * Rate limiter for the offline cache-data endpoint.
 * Allows 10 fetches per 60 minutes per user.
 */
export async function checkCacheDataRateLimit(userId: string): Promise<{
    blocked: boolean;
    retryAfterSeconds?: number;
}> {
    const key = `cache_data_rl:${userId}`;
    const windowMs = 60 * 60_000; // 60 minutes
    const windowSecs = 60 * 60;    // 3600 seconds
    const maxRequests = 10;
    const now = Date.now();

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            const { Redis } = await import('@upstash/redis');
            const redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
            const count = await redis.incr(key);
            if (count === 1) {
                await redis.expire(key, windowSecs);
            }
            if (count > maxRequests) {
                const ttl = await redis.ttl(key);
                return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : windowSecs };
            }
            return { blocked: false };
        } catch {
            // Fall through to in-memory
        }
    }

    const entry = inMemory.get(key);
    if (!entry || now > entry.resetAt) {
        inMemory.set(key, { count: 1, resetAt: now + windowMs });
        return { blocked: false };
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false };
}
