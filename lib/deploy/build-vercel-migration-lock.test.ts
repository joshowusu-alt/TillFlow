import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P0-B: Production/Preview Vercel builds must use Prisma's default advisory
 * lock during `prisma migrate deploy`. Disabling the lock allows concurrent
 * builds against the same database to race migration application.
 *
 * Migrations use `directUrl` (POSTGRES_URL_NON_POOLING) from
 * prisma/schema.postgres.prisma — not the pooled runtime URL.
 *
 * Boundary: advisory locking serializes migrate deploy only. It does not
 * authorise Production releases — that remains Gate 3 / P0-A / Owner controls.
 */
describe('P0-B build:vercel migration lock contract', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.postgres.prisma');
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');

  it('does not disable Prisma advisory locking in build:vercel', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const buildVercel = pkg.scripts?.['build:vercel'] ?? '';

    expect(buildVercel).toContain('prisma migrate deploy');
    expect(buildVercel).toContain('--schema=prisma/schema.postgres.prisma');
    expect(buildVercel).not.toMatch(/PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK\s*=\s*1/);
    expect(buildVercel).not.toContain('PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK');
  });

  it('keeps migrate deploy before next build so migration failure fails the release', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const buildVercel = pkg.scripts?.['build:vercel'] ?? '';
    const migrateIdx = buildVercel.indexOf('prisma migrate deploy');
    const nextBuildIdx = buildVercel.indexOf('next build');

    expect(migrateIdx).toBeGreaterThanOrEqual(0);
    expect(nextBuildIdx).toBeGreaterThan(migrateIdx);
  });

  it('configures Postgres schema with pooled url and directUrl for migrations', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    expect(schema).toMatch(/url\s*=\s*env\("POSTGRES_PRISMA_URL"\)/);
    expect(schema).toMatch(/directUrl\s*=\s*env\("POSTGRES_URL_NON_POOLING"\)/);
  });

  it('disables Vercel auto-deploy for the P0-B remediation branch only', () => {
    const vercel = JSON.parse(readFileSync(vercelJsonPath, 'utf8')) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    expect(vercel.git?.deploymentEnabled?.['ci/p0b-prisma-migration-lock']).toBe(false);
  });
});
