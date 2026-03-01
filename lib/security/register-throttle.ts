/**
 * Rate limiter for the registration endpoint.
 * 5 registrations per 60 minutes per IP. Uses Upstash if configured, in-memory fallback.
 */

const inMemory = new Map<string, { count: number; resetAt: number }>();

export async function checkRegisterRateLimit(ip: string): Promise<{
  blocked: boolean;
  retryAfterSeconds?: number;
}> {
  const key = `register_rl:${ip}`;
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 5;
  const now = Date.now();

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 3600);
      if (count > maxRequests) {
        const ttl = await redis.ttl(key);
        return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : 3600 };
      }
      return { blocked: false };
    } catch { /* fall through */ }
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
