// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('commercial release build boundary', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  it('uses generation and compilation only, with migrations separately invoked', () => {
    expect(vercel.buildCommand).toBe('npm run build:vercel');
    expect(vercel.installCommand).toBe('npm ci');
    for (const hook of ['preinstall', 'install', 'prepare', 'prebuild:vercel', 'postbuild:vercel']) expect(pkg.scripts[hook]).toBeUndefined();
    expect(pkg.scripts['build:vercel']).toBe('prisma generate --schema=prisma/schema.postgres.prisma && cross-env NODE_ENV=production next build');
    expect(pkg.scripts.postinstall).toBe('prisma generate --schema=prisma/schema.postgres.prisma');
    expect(pkg.scripts['db:migrate:deploy']).toBe('prisma migrate deploy --schema=prisma/schema.postgres.prisma');
    expect(pkg.scripts['build:vercel']).not.toMatch(/migrate|db push|seed|verify-supplier/);
    expect(vercel.git.deploymentEnabled['remediation/*']).toBe(false);
  });
});
