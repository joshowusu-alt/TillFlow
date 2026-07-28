'use strict';

/**
 * Phase 3A entrypoint for CI/local standalone runs.
 *
 * Loads the request-context harness, registers tsx's CJS TypeScript loader,
 * then executes scripts/phase3a-qa.ts. The tsx CLI entry can bypass a
 * preloaded Module._load hook; the CJS API keeps the shim active.
 */

const harness = require('./phase3a-harness.cjs');

const { register } = require('tsx/cjs/api');
register();

// Re-apply after register in case any loader refreshed module exports.
harness.ensureLoadedShims();

if (!harness.status.reactCacheShimmed || !harness.status.unstableCacheShimmed) {
  throw new Error(
    `[phase3a-runner] harness incomplete: ${JSON.stringify(harness.status)}`,
  );
}

require('./phase3a-qa.ts');
