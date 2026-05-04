import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';

type ThrottleResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 8;

const memoryStore = new Map<string, number[]>();

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
const redisClient = hasRedisEnv ? Redis.fromEnv() : null;

function key(slug: string, ip: string) {
  const hash = createHash('sha256').update(`${slug}|${ip}`).digest('hex');
  return `storefront:otp:request:${hash}`;
}

function memoryConsume(slug: string, ip: string): ThrottleResult {
  const k = `${slug}|${ip}`;
  const now = Date.now();
  const recent = (memoryStore.get(k) ?? []).filter((ts) => ts >= now - WINDOW_MS);
  recent.push(now);
  memoryStore.set(k, recent);

  if (recent.length > MAX_PER_IP) {
    return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function consumeOtpRequest(slug: string, ip: string): Promise<ThrottleResult> {
  const safeSlug = slug || 'unknown';
  const safeIp = ip || 'unknown';

  if (!redisClient) return memoryConsume(safeSlug, safeIp);

  try {
    const k = key(safeSlug, safeIp);
    const attemptsRaw = await redisClient.incr(k);
    const attempts = typeof attemptsRaw === 'number' ? attemptsRaw : Number(attemptsRaw ?? 1);
    if (attempts === 1) {
      await redisClient.expire(k, Math.ceil(WINDOW_MS / 1000));
    }
    if (attempts > MAX_PER_IP) {
      const ttl = await redisClient.ttl(k);
      const ttlNum = typeof ttl === 'number' ? ttl : Number(ttl ?? Math.ceil(WINDOW_MS / 1000));
      return {
        allowed: false,
        retryAfterSeconds: ttlNum > 0 ? ttlNum : Math.ceil(WINDOW_MS / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    console.warn('[security] Redis OTP throttle failure, falling back to memory:', error);
    return memoryConsume(safeSlug, safeIp);
  }
}
