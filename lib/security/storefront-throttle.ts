import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';

type ThrottleResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
};

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5; // 5 checkout attempts per minute per (slug, ip)
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minute lockout once tripped

const memoryStore = new Map<string, { failures: number[]; blockedUntilMs: number }>();

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redisClient = hasRedisEnv ? Redis.fromEnv() : null;

function obfuscatedKey(slug: string, ip: string) {
  return createHash('sha256').update(`${slug}|${ip}`).digest('hex');
}

function attemptsKey(slug: string, ip: string) {
  return `storefront:checkout:attempts:${obfuscatedKey(slug, ip)}`;
}

function lockKey(slug: string, ip: string) {
  return `storefront:checkout:lock:${obfuscatedKey(slug, ip)}`;
}

function msToSeconds(ms: number) {
  return Math.max(Math.ceil(ms / 1000), 1);
}

function memoryKey(slug: string, ip: string) {
  return `${slug}|${ip}`;
}

function getMemoryState(slug: string, ip: string) {
  const key = memoryKey(slug, ip);
  const state = memoryStore.get(key) ?? { failures: [], blockedUntilMs: 0 };
  memoryStore.set(key, state);
  return state;
}

function inMemoryConsume(slug: string, ip: string): ThrottleResult {
  const now = Date.now();
  const state = getMemoryState(slug, ip);

  // Garbage-collect failures outside the window
  state.failures = state.failures.filter((ts) => ts >= now - WINDOW_MS);
  if (state.blockedUntilMs && state.blockedUntilMs <= now) {
    state.blockedUntilMs = 0;
  }

  if (state.blockedUntilMs > now) {
    return {
      allowed: false,
      retryAfterSeconds: msToSeconds(state.blockedUntilMs - now),
      remainingAttempts: 0,
    };
  }

  state.failures.push(now);
  if (state.failures.length > MAX_ATTEMPTS) {
    state.blockedUntilMs = now + LOCKOUT_MS;
    return {
      allowed: false,
      retryAfterSeconds: msToSeconds(LOCKOUT_MS),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(MAX_ATTEMPTS - state.failures.length, 0),
  };
}

export async function consumeStorefrontCheckoutAttempt(
  slug: string,
  ipAddress: string,
): Promise<ThrottleResult> {
  const ip = ipAddress || 'unknown';
  const safeSlug = slug || 'unknown';

  if (!redisClient) {
    return inMemoryConsume(safeSlug, ip);
  }

  try {
    const lockTtl = await redisClient.ttl(lockKey(safeSlug, ip));
    const lockTtlNum = typeof lockTtl === 'number' ? lockTtl : Number(lockTtl ?? -2);
    if (lockTtlNum > 0 || lockTtlNum === -1) {
      return {
        allowed: false,
        retryAfterSeconds: lockTtlNum > 0 ? lockTtlNum : msToSeconds(LOCKOUT_MS),
        remainingAttempts: 0,
      };
    }

    const attemptsRaw = await redisClient.incr(attemptsKey(safeSlug, ip));
    const attempts = typeof attemptsRaw === 'number' ? attemptsRaw : Number(attemptsRaw ?? 1);
    if (attempts === 1) {
      await redisClient.expire(attemptsKey(safeSlug, ip), msToSeconds(WINDOW_MS));
    }

    if (attempts > MAX_ATTEMPTS) {
      await redisClient.set(lockKey(safeSlug, ip), '1', { ex: msToSeconds(LOCKOUT_MS) });
      return {
        allowed: false,
        retryAfterSeconds: msToSeconds(LOCKOUT_MS),
        remainingAttempts: 0,
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: Math.max(MAX_ATTEMPTS - attempts, 0),
    };
  } catch (error) {
    console.warn('[security] Redis storefront throttle error, falling back to in-memory:', error);
    return inMemoryConsume(safeSlug, ip);
  }
}
