'use strict';

/**
 * Phase 3A standalone harness.
 *
 * Phase 3A runs financial service assertions under plain `tsx` (no Next
 * request). That import path transitively loads:
 *   phase3a-qa → sales/returns → action-utils → auth → react.cache
 *   phase3a-qa → sales → next/cache.unstable_cache
 *
 * Stock React 18.2 has no `cache`; Next's request runtime supplies it.
 * `unstable_cache` requires Next's incremental cache and throws outside a
 * request. Vitest already stubs both for unit tests — this harness mirrors
 * only that framework boundary for the QA script.
 *
 * Important: tsx's CJS interop copies enumerable named exports. A Proxy trap
 * alone is not enough — `cache` must be an own enumerable property.
 *
 * It does NOT mock Prisma, createSale, cash-drawer math, or invent results.
 */

const Module = require('module');

function harnessAssert(condition, message) {
  if (!condition) {
    throw new Error(`[phase3a-harness] ${message}`);
  }
}

function identityCache(fn) {
  harnessAssert(typeof fn === 'function', 'react.cache expected a function');
  return fn;
}

function passThroughUnstableCache(fn, _keyParts, _options) {
  harnessAssert(typeof fn === 'function', 'unstable_cache expected a function');
  return fn;
}

function shimReactExports(react) {
  harnessAssert(react && typeof react === 'object', 'react module did not resolve to an object');
  if (typeof react.cache !== 'function') {
    Object.defineProperty(react, 'cache', {
      value: identityCache,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  harnessAssert(typeof react.cache === 'function', 'failed to install react.cache shim');
}

function shimNextCacheExports(nextCache) {
  harnessAssert(
    nextCache && typeof nextCache === 'object' && typeof nextCache.unstable_cache === 'function',
    'next/cache must export unstable_cache (dependency/export change?)',
  );
  if (nextCache.unstable_cache !== passThroughUnstableCache) {
    Object.defineProperty(nextCache, 'unstable_cache', {
      value: passThroughUnstableCache,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  harnessAssert(
    typeof nextCache.unstable_cache === 'function',
    'failed to install next/cache.unstable_cache shim',
  );
}

const status = globalThis.__PHASE3A_HARNESS__ ?? {
  reactCacheShimmed: false,
  unstableCacheShimmed: false,
  loadHookInstalled: false,
};

if (!status.loadHookInstalled) {
  const originalLoad = Module._load;
  Module._load = function phase3aHarnessLoad(request, parent, isMain) {
    if (request === 'react') {
      const react = originalLoad.apply(this, arguments);
      shimReactExports(react);
      status.reactCacheShimmed = true;
      return react;
    }
    if (request === 'next/cache') {
      const nextCache = originalLoad.apply(this, arguments);
      shimNextCacheExports(nextCache);
      status.unstableCacheShimmed = true;
      return nextCache;
    }
    return originalLoad.apply(this, arguments);
  };
  status.loadHookInstalled = true;
}

function ensureLoadedShims() {
  const react = require('react');
  shimReactExports(react);
  status.reactCacheShimmed = true;

  const nextCache = require('next/cache');
  shimNextCacheExports(nextCache);
  status.unstableCacheShimmed = true;
}

ensureLoadedShims();
globalThis.__PHASE3A_HARNESS__ = status;
module.exports = { ensureLoadedShims, status };
