import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P0-B: Separately approved migrations must use Prisma's default advisory
 * lock during `prisma migrate deploy`. Disabling the lock allows concurrent
 * migration runners against the same database to race migration application.
 *
 * Migrations use `directUrl` (POSTGRES_URL_NON_POOLING) from
 * prisma/schema.postgres.prisma — not the pooled runtime URL.
 *
 * Boundary: advisory locking serializes migrate deploy only. It does not
 * authorise Production releases — that remains Gate 3 / P0-A / Owner controls.
 */
describe('P0-B separate migration lock and pure-build contract', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.postgres.prisma');
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');

  it('does not disable Prisma advisory locking in the explicit migration command', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const buildVercel = pkg.scripts?.['db:migrate:deploy'] ?? '';

    expect(buildVercel).toContain('prisma migrate deploy');
    expect(buildVercel).toContain('--schema=prisma/schema.postgres.prisma');
    expect(buildVercel).not.toMatch(/PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK\s*=\s*1/);
    expect(buildVercel).not.toContain('PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK');
  });

  it('keeps schema migration out of automatic Vercel builds', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    expect(pkg.scripts['build:vercel']).toContain('next build');
    expect(pkg.scripts['build:vercel']).not.toMatch(/migrate|db push|seed/);
    expect(pkg.scripts['db:migrate:deploy']).toBe('prisma migrate deploy --schema=prisma/schema.postgres.prisma');
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
