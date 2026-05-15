type RateLimitStore = Map<string, { count: number; windowStart: number }>;

// NOTE: This store is in-memory per serverless instance. On Vercel, multiple cold-start instances
// do not share state — rate limiting is partially effective across concurrent instances. For true
// distributed enforcement (e.g. brute-force protection across all replicas), swap this store for
// an Upstash Redis client using the sliding-window algorithm.
const stores: Map<string, RateLimitStore> = new Map();

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export function checkRateLimit(
  storeKey: string,
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs: number } {
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  const store = stores.get(storeKey)!;
  const now = Date.now();
  const existing = store.get(identifier);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - existing.windowStart);
    return { allowed: false, retryAfterMs };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
};

export const SEARCH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
};
