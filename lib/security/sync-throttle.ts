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
