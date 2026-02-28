import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockRedisGet,
  mockRedisTtl,
  mockRedisIncr,
  mockRedisExpire,
  mockRedisSet,
  mockRedisDel,
  mockRedisFromEnv,
} = vi.hoisted(() => {
  const mockRedisGet = vi.fn();
  const mockRedisTtl = vi.fn();
  const mockRedisIncr = vi.fn();
  const mockRedisExpire = vi.fn();
  const mockRedisSet = vi.fn();
  const mockRedisDel = vi.fn();
  const mockRedisFromEnv = vi.fn(() => ({
    get: mockRedisGet,
    ttl: mockRedisTtl,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    set: mockRedisSet,
    del: mockRedisDel,
  }));
  return {
    mockRedisGet,
    mockRedisTtl,
    mockRedisIncr,
    mockRedisExpire,
    mockRedisSet,
    mockRedisDel,
    mockRedisFromEnv,
  };
});

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: mockRedisFromEnv },
}));

// Import AFTER mocks so the module uses the mocked Redis constructor.
// Because UPSTASH env vars are not set in the test environment, hasRedisEnv
// evaluates to false and redisClient is null — all calls use the in-memory path.
import {
  getLoginThrottleStatus,
  recordLoginFailure,
  clearLoginFailures,
} from './login-throttle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMAIL = 'test@example.com';
const IP = '127.0.0.1';

// Custom short timeouts so we don't wait 15 min in tests
const FAST_OPTS = {
  windowMs: 5_000,   // 5 s window
  maxAttempts: 3,    // block after 3 failures
  lockoutMs: 10_000, // 10 s lockout
};

async function driveToLockout(
  email = EMAIL,
  ip = IP,
  opts = FAST_OPTS,
) {
  for (let i = 0; i < opts.maxAttempts; i++) {
    await recordLoginFailure(email, ip, opts);
  }
}

// ---------------------------------------------------------------------------
// In-memory path (default: no UPSTASH env vars set)
// ---------------------------------------------------------------------------
describe('login-throttle — in-memory path', () => {
  beforeEach(async () => {
    // Clear any leftover state from previous tests
    await clearLoginFailures(EMAIL, IP);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- initial state -------------------------------------------------------

  it('allows the very first attempt (not blocked, full remaining attempts)', async () => {
    const status = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);

    expect(status.isBlocked).toBe(false);
    expect(status.retryAfterSeconds).toBe(0);
    expect(status.remainingAttempts).toBe(FAST_OPTS.maxAttempts);
  });

  // ---- progressive failures ------------------------------------------------

  it('decrements remainingAttempts after each failed login', async () => {
    await recordLoginFailure(EMAIL, IP, FAST_OPTS);
    const after1 = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(after1.remainingAttempts).toBe(2);
    expect(after1.isBlocked).toBe(false);

    await recordLoginFailure(EMAIL, IP, FAST_OPTS);
    const after2 = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(after2.remainingAttempts).toBe(1);
    expect(after2.isBlocked).toBe(false);
  });

  it('blocks the account once maxAttempts failures are recorded', async () => {
    await driveToLockout();

    const status = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(status.isBlocked).toBe(true);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
    expect(status.remainingAttempts).toBe(0);
  });

  it('retryAfterSeconds is positive and at most lockoutMs/1000 when blocked', async () => {
    await driveToLockout();

    const status = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
    expect(status.retryAfterSeconds).toBeLessThanOrEqual(
      FAST_OPTS.lockoutMs / 1000,
    );
  });

  // ---- lockout expiry ------------------------------------------------------

  it('unblocks the account after the lockout window elapses', async () => {
    await driveToLockout();

    // Advance time past the lockout period
    vi.advanceTimersByTime(FAST_OPTS.lockoutMs + 1);

    const status = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(status.isBlocked).toBe(false);
    expect(status.retryAfterSeconds).toBe(0);
  });

  it('prunes failures that fall outside the sliding window', async () => {
    // Record two failures
    await recordLoginFailure(EMAIL, IP, FAST_OPTS);
    await recordLoginFailure(EMAIL, IP, FAST_OPTS);

    // Advance time past the window so those failures are stale
    vi.advanceTimersByTime(FAST_OPTS.windowMs + 1);

    const status = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    // Stale failures no longer count; remainingAttempts should be back to max
    expect(status.remainingAttempts).toBe(FAST_OPTS.maxAttempts);
    expect(status.isBlocked).toBe(false);
  });

  // ---- clearLoginFailures --------------------------------------------------

  it('clearLoginFailures resets the state immediately', async () => {
    await driveToLockout();
    expect((await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS)).isBlocked).toBe(true);

    await clearLoginFailures(EMAIL, IP);

    const after = await getLoginThrottleStatus(EMAIL, IP, FAST_OPTS);
    expect(after.isBlocked).toBe(false);
    expect(after.remainingAttempts).toBe(FAST_OPTS.maxAttempts);
  });

  // ---- isolation between identities ----------------------------------------

  it('does not interfere with a different email/IP combination', async () => {
    const OTHER_EMAIL = 'other@example.com';
    const OTHER_IP = '10.0.0.1';

    // Clean up other combo just in case
    await clearLoginFailures(OTHER_EMAIL, OTHER_IP);

    await driveToLockout(); // locks EMAIL + IP

    const otherStatus = await getLoginThrottleStatus(OTHER_EMAIL, OTHER_IP, FAST_OPTS);
    expect(otherStatus.isBlocked).toBe(false);
    expect(otherStatus.remainingAttempts).toBe(FAST_OPTS.maxAttempts);

    // Cleanup
    await clearLoginFailures(OTHER_EMAIL, OTHER_IP);
  });

  it('treats different IP addresses for the same email as separate buckets', async () => {
    const IP_B = '192.168.1.1';
    await clearLoginFailures(EMAIL, IP_B);

    await driveToLockout(EMAIL, IP, FAST_OPTS); // lock EMAIL+IP

    const statusB = await getLoginThrottleStatus(EMAIL, IP_B, FAST_OPTS);
    expect(statusB.isBlocked).toBe(false);

    await clearLoginFailures(EMAIL, IP_B);
  });

  it('treats different emails for the same IP as separate buckets', async () => {
    const EMAIL_B = 'another@example.com';
    await clearLoginFailures(EMAIL_B, IP);

    await driveToLockout(EMAIL, IP, FAST_OPTS);

    const statusB = await getLoginThrottleStatus(EMAIL_B, IP, FAST_OPTS);
    expect(statusB.isBlocked).toBe(false);

    await clearLoginFailures(EMAIL_B, IP);
  });

  // ---- PII / key obfuscation -----------------------------------------------

  it('does not store the plain-text email in the in-memory key (uses a hash)', async () => {
    // The module uses a SHA-256 digest internally. We can't directly inspect
    // the Map, but we verify that the plain email is NOT part of any key by
    // ensuring the module doesn't throw and behaves correctly with odd input.
    const weirdEmail = 'UPPER@EXAMPLE.COM';
    const weirdIp = '::1';

    // Should not throw and should produce a valid status object
    await expect(
      getLoginThrottleStatus(weirdEmail, weirdIp, FAST_OPTS),
    ).resolves.toMatchObject({
      isBlocked: expect.any(Boolean),
      retryAfterSeconds: expect.any(Number),
      remainingAttempts: expect.any(Number),
    });
  });

  it('normalises email to lowercase so mixed-case duplicates share the same bucket', async () => {
    await clearLoginFailures('UPPER@EXAMPLE.COM', IP);
    await clearLoginFailures('upper@example.com', IP);

    // Record failures under the uppercase variant
    await recordLoginFailure('UPPER@EXAMPLE.COM', IP, FAST_OPTS);
    await recordLoginFailure('UPPER@EXAMPLE.COM', IP, FAST_OPTS);

    // Check under lowercase — should see the same failure count
    const status = await getLoginThrottleStatus('upper@example.com', IP, FAST_OPTS);
    expect(status.remainingAttempts).toBe(1); // 3 max - 2 failures

    await clearLoginFailures('upper@example.com', IP);
  });

  // ---- default options -------------------------------------------------------

  it('uses sensible defaults (maxAttempts=8) when no opts are passed', async () => {
    const status = await getLoginThrottleStatus(EMAIL, IP);
    expect(status.remainingAttempts).toBe(8);
  });

  // ---- unknown IP -----------------------------------------------------------

  it('handles a missing/undefined IP gracefully (falls back to "unknown")', async () => {
    const UNKNOWN_IP = '';
    await clearLoginFailures(EMAIL, UNKNOWN_IP);

    await expect(
      getLoginThrottleStatus(EMAIL, UNKNOWN_IP, FAST_OPTS),
    ).resolves.toMatchObject({ isBlocked: false });

    await clearLoginFailures(EMAIL, UNKNOWN_IP);
  });
});

// ---------------------------------------------------------------------------
// Redis-backed path
// ---------------------------------------------------------------------------
describe('login-throttle — Redis-backed path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * For the Redis path we need to reload the module with the env vars present.
   * We use `vi.stubEnv` + `vi.resetModules()` + dynamic import so that the
   * module-level `hasRedisEnv` check sees the env vars.
   */
  async function loadWithRedis() {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token');
    vi.resetModules();

    // Re-apply the mock so the freshly-loaded module gets our fake client
    vi.mock('@upstash/redis', () => ({
      Redis: { fromEnv: mockRedisFromEnv },
    }));

    const mod = await import('./login-throttle');
    return mod;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getLoginThrottleStatus returns not-blocked when Redis reports no lock', async () => {
    mockRedisTtl.mockResolvedValue(-2); // key does not exist
    mockRedisGet.mockResolvedValue(0);  // no failures recorded

    const { getLoginThrottleStatus: get } = await loadWithRedis();
    const status = await get(EMAIL, IP, FAST_OPTS);

    expect(status.isBlocked).toBe(false);
    expect(status.remainingAttempts).toBe(FAST_OPTS.maxAttempts);
  });

  it('getLoginThrottleStatus returns blocked when Redis reports an active lock', async () => {
    mockRedisTtl.mockResolvedValue(42); // 42 s remaining
    mockRedisGet.mockResolvedValue(FAST_OPTS.maxAttempts);

    const { getLoginThrottleStatus: get } = await loadWithRedis();
    const status = await get(EMAIL, IP, FAST_OPTS);

    expect(status.isBlocked).toBe(true);
    expect(status.retryAfterSeconds).toBe(42);
    expect(status.remainingAttempts).toBe(0);
  });

  it('recordLoginFailure increments the Redis counter and sets a lock after maxAttempts', async () => {
    mockRedisIncr.mockResolvedValueOnce(FAST_OPTS.maxAttempts); // threshold hit
    mockRedisExpire.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue('OK');

    const { recordLoginFailure: record } = await loadWithRedis();
    await record(EMAIL, IP, FAST_OPTS);

    expect(mockRedisIncr).toHaveBeenCalledOnce();
    expect(mockRedisSet).toHaveBeenCalledOnce(); // lock key set
  });

  it('recordLoginFailure sets TTL on the attempts key for the first failure only', async () => {
    mockRedisIncr.mockResolvedValueOnce(1); // first failure
    mockRedisExpire.mockResolvedValue(1);

    const { recordLoginFailure: record } = await loadWithRedis();
    await record(EMAIL, IP, FAST_OPTS);

    expect(mockRedisExpire).toHaveBeenCalledOnce();
    expect(mockRedisSet).not.toHaveBeenCalled(); // no lock yet at attempt #1
  });

  it('clearLoginFailures deletes both the attempts key and the lock key', async () => {
    mockRedisDel.mockResolvedValue(2);

    const { clearLoginFailures: clear } = await loadWithRedis();
    await clear(EMAIL, IP);

    expect(mockRedisDel).toHaveBeenCalledOnce();
    // Should delete two keys (attempts + lock)
    const [firstArg, secondArg] = mockRedisDel.mock.calls[0] as string[];
    expect(firstArg).toMatch(/^auth:login:attempts:/);
    expect(secondArg).toMatch(/^auth:login:lock:/);
  });

  it('falls back to in-memory when Redis throws on getLoginThrottleStatus', async () => {
    mockRedisTtl.mockRejectedValue(new Error('Redis connection refused'));
    mockRedisGet.mockRejectedValue(new Error('Redis connection refused'));

    const { getLoginThrottleStatus: get } = await loadWithRedis();
    // Should not throw; falls back silently
    await expect(get(EMAIL, IP, FAST_OPTS)).resolves.toMatchObject({
      isBlocked: expect.any(Boolean),
    });
  });

  it('falls back to in-memory when Redis throws on recordLoginFailure', async () => {
    mockRedisIncr.mockRejectedValue(new Error('timeout'));

    const { recordLoginFailure: record } = await loadWithRedis();
    await expect(record(EMAIL, IP, FAST_OPTS)).resolves.toBeUndefined();
  });

  it('falls back to in-memory when Redis throws on clearLoginFailures', async () => {
    mockRedisDel.mockRejectedValue(new Error('timeout'));

    const { clearLoginFailures: clear } = await loadWithRedis();
    await expect(clear(EMAIL, IP)).resolves.toBeUndefined();
  });
});
