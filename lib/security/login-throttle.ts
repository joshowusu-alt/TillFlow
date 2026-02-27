import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';

type AttemptState = {
  failures: number[];
  blockedUntilMs: number;
};

type ThrottleOptions = {
  windowMs?: number;
  maxAttempts?: number;
  lockoutMs?: number;
};

const attemptStore = new Map<string, AttemptState>();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redisClient = hasRedisEnv ? Redis.fromEnv() : null;

if (!hasRedisEnv && process.env.NODE_ENV === 'production') {
  console.error(
    '[security] Login throttle is using in-memory fallback — brute-force protection is NOT persistent.\n' +
    'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables to enable Redis-backed throttling.'
  );
}

function normalizeThrottleOpts(opts?: ThrottleOptions) {
  return {
    windowMs: opts?.windowMs ?? DEFAULT_WINDOW_MS,
    maxAttempts: opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    lockoutMs: opts?.lockoutMs ?? DEFAULT_LOCKOUT_MS
  };
}

function keyFor(email: string, ipAddress: string) {
  return `${email.toLowerCase()}|${ipAddress || 'unknown'}`;
}

function obfuscatedKey(email: string, ipAddress: string) {
  return createHash('sha256').update(keyFor(email, ipAddress)).digest('hex');
}

function redisAttemptsKey(email: string, ipAddress: string) {
  return `auth:login:attempts:${obfuscatedKey(email, ipAddress)}`;
}

function redisLockKey(email: string, ipAddress: string) {
  return `auth:login:lock:${obfuscatedKey(email, ipAddress)}`;
}

function nowMs() {
  return Date.now();
}

function msToSeconds(valueMs: number) {
  return Math.max(Math.ceil(valueMs / 1000), 1);
}

function normalize(state: AttemptState, windowMs: number) {
  const cutoff = nowMs() - windowMs;
  state.failures = state.failures.filter((ts) => ts >= cutoff);
  if (state.blockedUntilMs && state.blockedUntilMs <= nowMs()) {
    state.blockedUntilMs = 0;
  }
}

function getState(email: string, ipAddress: string) {
  const key = keyFor(email, ipAddress);
  const state = attemptStore.get(key) ?? { failures: [], blockedUntilMs: 0 };
  attemptStore.set(key, state);
  return state;
}

function getInMemoryLoginThrottleStatus(email: string, ipAddress: string, opts?: ThrottleOptions) {
  const { windowMs, maxAttempts } = normalizeThrottleOpts(opts);
  const state = getState(email, ipAddress);
  normalize(state, windowMs);

  const isBlocked = state.blockedUntilMs > nowMs();
  const retryAfterSeconds = isBlocked
    ? Math.max(Math.ceil((state.blockedUntilMs - nowMs()) / 1000), 0)
    : 0;
  return {
    isBlocked,
    retryAfterSeconds,
    remainingAttempts: Math.max(maxAttempts - state.failures.length, 0)
  };
}

function recordInMemoryLoginFailure(email: string, ipAddress: string, opts?: ThrottleOptions) {
  const { windowMs, maxAttempts, lockoutMs } = normalizeThrottleOpts(opts);
  const state = getState(email, ipAddress);
  normalize(state, windowMs);

  state.failures.push(nowMs());
  if (state.failures.length >= maxAttempts) {
    state.blockedUntilMs = nowMs() + lockoutMs;
  }
}

function clearInMemoryLoginFailures(email: string, ipAddress: string) {
  attemptStore.delete(keyFor(email, ipAddress));
}

export async function getLoginThrottleStatus(
  email: string,
  ipAddress: string,
  opts?: ThrottleOptions
) {
  const { maxAttempts, lockoutMs } = normalizeThrottleOpts(opts);

  if (!redisClient) {
    return getInMemoryLoginThrottleStatus(email, ipAddress, opts);
  }

  try {
    const [lockTtlRaw, attemptsRaw] = await Promise.all([
      redisClient.ttl(redisLockKey(email, ipAddress)),
      redisClient.get<number>(redisAttemptsKey(email, ipAddress))
    ]);

    const lockTtl = typeof lockTtlRaw === 'number' ? lockTtlRaw : Number(lockTtlRaw ?? -2);
    const attempts = typeof attemptsRaw === 'number' ? attemptsRaw : Number(attemptsRaw ?? 0);
    const isBlocked = lockTtl > 0 || lockTtl === -1;

    return {
      isBlocked,
      retryAfterSeconds: isBlocked ? (lockTtl > 0 ? lockTtl : msToSeconds(lockoutMs)) : 0,
      remainingAttempts: Math.max(maxAttempts - attempts, 0)
    };
  } catch (e) {
    console.warn('[security] Redis login throttle error, falling back to in-memory:', e);
    return getInMemoryLoginThrottleStatus(email, ipAddress, opts);
  }
}

export async function recordLoginFailure(
  email: string,
  ipAddress: string,
  opts?: ThrottleOptions
) {
  const { windowMs, maxAttempts, lockoutMs } = normalizeThrottleOpts(opts);

  if (!redisClient) {
    recordInMemoryLoginFailure(email, ipAddress, opts);
    return;
  }

  try {
    const attemptsKey = redisAttemptsKey(email, ipAddress);
    const lockKey = redisLockKey(email, ipAddress);
    const attempts = await redisClient.incr(attemptsKey);
    if (attempts === 1) {
      await redisClient.expire(attemptsKey, msToSeconds(windowMs));
    }
    if (attempts >= maxAttempts) {
      await redisClient.set(lockKey, '1', { ex: msToSeconds(lockoutMs) });
    }
  } catch (e) {
    console.warn('[security] Redis login throttle error, falling back to in-memory:', e);
    recordInMemoryLoginFailure(email, ipAddress, opts);
  }
}

export async function clearLoginFailures(email: string, ipAddress: string) {
  if (!redisClient) {
    clearInMemoryLoginFailures(email, ipAddress);
    return;
  }

  try {
    await redisClient.del(
      redisAttemptsKey(email, ipAddress),
      redisLockKey(email, ipAddress)
    );
  } catch (e) {
    console.warn('[security] Redis login throttle error, falling back to in-memory:', e);
    clearInMemoryLoginFailures(email, ipAddress);
  }
}
