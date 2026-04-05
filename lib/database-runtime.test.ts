import { describe, expect, it } from 'vitest';

import {
  isPostgresDatabaseUrl,
  isPostgresRuntimeEnv,
  isSqliteDatabaseUrl,
  isSqliteRuntimeEnv,
} from '@/lib/database-runtime';

describe('isSqliteDatabaseUrl', () => {
  it('accepts sqlite file URLs and local database paths', () => {
    expect(isSqliteDatabaseUrl('file:./dev.db')).toBe(true);
    expect(isSqliteDatabaseUrl('sqlite:./data/app.sqlite')).toBe(true);
    expect(isSqliteDatabaseUrl('C:\\data\\dev.sqlite3')).toBe(true);
  });

  it('rejects non-sqlite network database URLs even when they contain db-like hostnames', () => {
    expect(isSqliteDatabaseUrl('postgresql://user:pass@branch.db.example.com/tillflow')).toBe(false);
    expect(isSqliteDatabaseUrl('postgres://user:pass@localhost:5432/tillflow')).toBe(false);
  });
});

describe('isPostgresDatabaseUrl', () => {
  it('accepts postgres connection strings', () => {
    expect(isPostgresDatabaseUrl('postgres://user:pass@localhost:5432/tillflow')).toBe(true);
    expect(isPostgresDatabaseUrl('postgresql://user:pass@localhost:5432/tillflow')).toBe(true);
  });

  it('rejects sqlite URLs and empty values', () => {
    expect(isPostgresDatabaseUrl('file:./dev.db')).toBe(false);
    expect(isPostgresDatabaseUrl(undefined)).toBe(false);
  });
});

describe('runtime env helpers', () => {
  it('treats postgres prisma urls as authoritative over a leftover sqlite DATABASE_URL', () => {
    const env = {
      DATABASE_URL: 'file:./dev.db',
      POSTGRES_PRISMA_URL: 'postgresql://user:pass@localhost:5432/tillflow',
      POSTGRES_URL_NON_POOLING: 'postgresql://user:pass@localhost:5432/tillflow',
    } as NodeJS.ProcessEnv;

    expect(isPostgresRuntimeEnv(env)).toBe(true);
    expect(isSqliteRuntimeEnv(env)).toBe(false);
  });

  it('falls back to sqlite runtime when no postgres prisma urls are present', () => {
    const env = {
      DATABASE_URL: 'file:./dev.db',
    } as NodeJS.ProcessEnv;

    expect(isPostgresRuntimeEnv(env)).toBe(false);
    expect(isSqliteRuntimeEnv(env)).toBe(true);
  });
});
