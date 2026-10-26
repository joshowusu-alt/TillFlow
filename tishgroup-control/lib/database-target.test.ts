import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISPOSABLE_SENTINEL_LABEL,
  ISOLATED_PREVIEW_FINGERPRINT,
  PRODUCTION_FINGERPRINT,
  assertDisposableRemoteTarget,
  assertExpectedIdentity,
  assertLoopbackDestructiveTarget,
  assertNoForceEscapeHatch,
  assertPasswordCutoverTarget,
  canonicalHostPrefix,
  parseDatabaseIdentity,
} from '@/lib/database-target';

const productionUrl = 'postgresql://neondb_owner:secret@ep-fancy-darkness-abyuvjxt.example.test/neondb';
const productionPoolerUrl = 'postgresql://neondb_owner:secret@ep-fancy-darkness-abyuvjxt-pooler.example.test/neondb';
const previewUrl = 'postgresql://tillflow_preview_app:secret@ep-old-sunset-za6o0nyo.example.test/tillflow_preview';
const unknownUrl = 'postgresql://neondb_owner:secret@ep-blue-rain-example.example.test/neondb';
const loopbackUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/tishgroup_ci_empty';

const productionEnv = {
  CONTROL_PASSWORD_CUTOVER: '1',
  CONTROL_PASSWORD_CUTOVER_ENV: 'production',
  CONTROL_PASSWORD_CUTOVER_HOST_PREFIX: PRODUCTION_FINGERPRINT.hostPrefix,
  CONTROL_PASSWORD_CUTOVER_DATABASE: PRODUCTION_FINGERPRINT.databaseName,
  CONTROL_PASSWORD_CUTOVER_USER: PRODUCTION_FINGERPRINT.user,
};

const previewEnv = {
  CONTROL_PASSWORD_CUTOVER_ENV: 'preview',
  CONTROL_PREVIEW_ISOLATED_DB: '1',
  CONTROL_DISPOSABLE_MODE: '1',
  CONTROL_DISPOSABLE_SENTINEL_LABEL: DISPOSABLE_SENTINEL_LABEL,
  CONTROL_PASSWORD_CUTOVER_HOST_PREFIX: ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
  CONTROL_PASSWORD_CUTOVER_DATABASE: ISOLATED_PREVIEW_FINGERPRINT.databaseName,
  CONTROL_PASSWORD_CUTOVER_USER: ISOLATED_PREVIEW_FINGERPRINT.user,
};

describe('database target identity', () => {
  it('keeps the TypeScript and script fingerprints identical', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/lib/database-target.mjs'), 'utf8');
    expect(source).toContain(`hostPrefix: '${PRODUCTION_FINGERPRINT.hostPrefix}'`);
    expect(source).toContain(`databaseName: '${PRODUCTION_FINGERPRINT.databaseName}'`);
    expect(source).toContain(`user: '${PRODUCTION_FINGERPRINT.user}'`);
    expect(source).toContain(`hostPrefix: '${ISOLATED_PREVIEW_FINGERPRINT.hostPrefix}'`);
    expect(source).toContain(`databaseName: '${ISOLATED_PREVIEW_FINGERPRINT.databaseName}'`);
    expect(source).toContain(`user: '${ISOLATED_PREVIEW_FINGERPRINT.user}'`);
  });

  it('canonicalises pooler hosts without fuzzy prefix matching', () => {
    expect(canonicalHostPrefix('ep-fancy-darkness-abyuvjxt-pooler.neon.tech')).toBe(PRODUCTION_FINGERPRINT.hostPrefix);
    expect(canonicalHostPrefix('127.0.0.1')).toBe('127.0.0.1');
    expect(parseDatabaseIdentity(productionPoolerUrl).hostPrefix).toBe(PRODUCTION_FINGERPRINT.hostPrefix);
  });

  it('refuses altered host, database name, and user', () => {
    const identity = parseDatabaseIdentity(productionUrl);
    expect(() => assertExpectedIdentity({
      identity,
      expectedHostPrefix: 'ep-old-sunset-za6o0nyo',
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: PRODUCTION_FINGERPRINT.user,
    })).toThrow(/host prefix/);
    expect(() => assertExpectedIdentity({
      identity,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: 'tillflow_preview',
      expectedUser: PRODUCTION_FINGERPRINT.user,
    })).toThrow(/database name/);
    expect(() => assertExpectedIdentity({
      identity,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: 'tillflow_preview_app',
    })).toThrow(/database user/);
  });
});

describe('password cutover targeting', () => {
  it('accepts the exact Production fingerprint', () => {
    expect(() => assertPasswordCutoverTarget({
      mode: 'production',
      env: productionEnv,
      databaseUrl: productionUrl,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: PRODUCTION_FINGERPRINT.user,
    })).not.toThrow();
  });

  it('refuses Preview, unknown, and loopback databases in Production mode', () => {
    expect(() => assertPasswordCutoverTarget({
      mode: 'production',
      env: productionEnv,
      databaseUrl: previewUrl,
      expectedHostPrefix: ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
      expectedDatabase: ISOLATED_PREVIEW_FINGERPRINT.databaseName,
      expectedUser: ISOLATED_PREVIEW_FINGERPRINT.user,
    })).toThrow(/not the allowlisted Production fingerprint|disposable\/Preview flags|Production database/);
    expect(() => assertPasswordCutoverTarget({
      mode: 'production',
      env: productionEnv,
      databaseUrl: unknownUrl,
      expectedHostPrefix: 'ep-blue-rain-example',
      expectedDatabase: 'neondb',
      expectedUser: 'neondb_owner',
    })).toThrow(/not the allowlisted Production fingerprint/);
    expect(() => assertPasswordCutoverTarget({
      mode: 'production',
      env: productionEnv,
      databaseUrl: loopbackUrl,
      expectedHostPrefix: '127.0.0.1',
      expectedDatabase: 'tishgroup_ci_empty',
      expectedUser: 'postgres',
    })).toThrow(/proven Production database|not the allowlisted Production fingerprint/);
  });

  it('refuses Production and unknown databases in Preview mode', () => {
    expect(() => assertPasswordCutoverTarget({
      mode: 'preview',
      env: previewEnv,
      databaseUrl: productionUrl,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: PRODUCTION_FINGERPRINT.user,
    })).toThrow(/Production database cannot be used in Preview mode/);
    expect(() => assertPasswordCutoverTarget({
      mode: 'preview',
      env: previewEnv,
      databaseUrl: unknownUrl,
      expectedHostPrefix: 'ep-blue-rain-example',
      expectedDatabase: 'neondb',
      expectedUser: 'neondb_owner',
    })).toThrow(/unknown database/);
  });

  it('refuses Preview remote operations when only the isolated boolean is set', () => {
    expect(() => assertPasswordCutoverTarget({
      mode: 'preview',
      env: {
        CONTROL_PASSWORD_CUTOVER_ENV: 'preview',
        CONTROL_PREVIEW_ISOLATED_DB: '1',
      },
      databaseUrl: previewUrl,
      expectedHostPrefix: ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
      expectedDatabase: ISOLATED_PREVIEW_FINGERPRINT.databaseName,
      expectedUser: ISOLATED_PREVIEW_FINGERPRINT.user,
    })).toThrow(/CONTROL_DISPOSABLE_MODE=1/);
  });

  it('refuses a sentinel, project/branch, or environment mismatch', () => {
    expect(() => assertPasswordCutoverTarget({
      mode: 'preview',
      env: { ...previewEnv, CONTROL_DISPOSABLE_SENTINEL_LABEL: 'wrong-branch' },
      databaseUrl: previewUrl,
      expectedHostPrefix: ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
      expectedDatabase: ISOLATED_PREVIEW_FINGERPRINT.databaseName,
      expectedUser: ISOLATED_PREVIEW_FINGERPRINT.user,
    })).toThrow(/sentinel label/);
    expect(() => assertPasswordCutoverTarget({
      mode: 'production',
      env: { ...productionEnv, CONTROL_PASSWORD_CUTOVER_ENV: 'preview' },
      databaseUrl: productionUrl,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: PRODUCTION_FINGERPRINT.user,
    })).toThrow(/CONTROL_PASSWORD_CUTOVER_ENV=production/);
  });
});

describe('destructive targeting', () => {
  it('refuses remote DROP even when isolated flags are set', () => {
    expect(() => assertLoopbackDestructiveTarget(previewUrl, 'tishgroup_ci_empty')).toThrow(/loopback-only/);
    expect(() => assertLoopbackDestructiveTarget(productionUrl, 'tishgroup_ci_empty')).toThrow(/loopback-only/);
    expect(() => assertLoopbackDestructiveTarget(loopbackUrl, 'neondb')).toThrow(/tishgroup_ci/);
  });

  it('allows loopback CI database names only', () => {
    expect(() => assertLoopbackDestructiveTarget(loopbackUrl, 'tishgroup_ci_empty')).not.toThrow();
  });

  it('refuses force escape hatches', () => {
    expect(() => assertNoForceEscapeHatch(['node', 'script.mjs', '--force'], {})).toThrow(/force/);
    expect(() => assertNoForceEscapeHatch(['node', 'script.mjs'], { CONTROL_FORCE: '1' })).toThrow(/force/);
  });

  it('refuses disposable remote operations against Production', () => {
    expect(() => assertDisposableRemoteTarget({
      env: {
        CONTROL_DISPOSABLE_MODE: '1',
        CONTROL_PREVIEW_ISOLATED_DB: '1',
      },
      databaseUrl: productionUrl,
      expectedHostPrefix: PRODUCTION_FINGERPRINT.hostPrefix,
      expectedDatabase: PRODUCTION_FINGERPRINT.databaseName,
      expectedUser: PRODUCTION_FINGERPRINT.user,
      confirmTarget: DISPOSABLE_SENTINEL_LABEL,
    })).toThrow(/not the allowlisted disposable Preview database/);
  });
});

describe('committed script safety', () => {
  it('does not allow CONTROL_PREVIEW_ISOLATED_DB to authorise remote DROP', () => {
    const source = readFileSync(join(process.cwd(), '..', 'scripts', 'validate-control-migrations.mjs'), 'utf8');
    expect(source).toContain('assertLoopbackDestructiveTarget');
    expect(source).toContain('DESTRUCTIVE MIGRATION VALIDATION IS LOOPBACK-ONLY');
    expect(source).not.toMatch(/CONTROL_PREVIEW_ISOLATED_DB !== '1'/);
  });

  it('committed TishGroup scripts never contain DROP SCHEMA', () => {
    const files = [
      'scripts/provision-control-staff-password.mjs',
      'scripts/assert-isolated-database.mjs',
      'scripts/ensure-disposable-sentinel.mjs',
      'scripts/ensure-control-schema.mjs',
      'scripts/auth-cutover-preflight.mjs',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/DROP SCHEMA/i);
    }
  });
});
