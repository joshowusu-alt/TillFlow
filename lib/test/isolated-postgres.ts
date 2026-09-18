import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

export type PostgresUrlIdentity = {
  hostPrefix: string;
  database: string;
  schema: string;
};

export function resolveBoundPostgresUrl(): string {
  return (
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.INVENTORY_INCREASE_CONCURRENCY_DATABASE_URL?.trim() ||
    process.env.SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ''
  );
}

export function postgresUrlIdentity(url: string): PostgresUrlIdentity {
  const parsed = new URL(url);
  return {
    hostPrefix: parsed.hostname.split('.')[0],
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] || ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

export function canRunLivePostgres(url = resolveBoundPostgresUrl()): boolean {
  return isPostgresDatabaseUrl(url);
}

export function assertIsolatedPreviewHost(url: string): PostgresUrlIdentity {
  const identity = postgresUrlIdentity(url);
  if (process.env.TILLFLOW_REQUIRE_ISOLATED_PREVIEW === '1') {
    if (!/old-sunset/i.test(identity.hostPrefix) || identity.database !== 'tillflow_preview') {
      throw new Error(
        `Refusing non-isolated Postgres hostPrefix=${identity.hostPrefix} database=${identity.database}`,
      );
    }
  }
  return identity;
}

export function bindPrismaPostgresUrls(url: string): PostgresUrlIdentity {
  const identity = assertIsolatedPreviewHost(url);
  process.env.DATABASE_URL = url;
  process.env.POSTGRES_PRISMA_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;
  process.env.SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL = url;
  process.env.INVENTORY_INCREASE_CONCURRENCY_DATABASE_URL = url;
  return identity;
}

export function createBoundPrismaClient(url: string): PrismaClient {
  bindPrismaPostgresUrls(url);
  return new PrismaClient({
    datasources: { db: { url } },
  });
}

export async function proveWalkthroughPostgresSchema(prisma: PrismaClient) {
  const [dbRow] = await prisma.$queryRaw<Array<{ db: string; schema: string }>>`
    SELECT current_database() AS db, current_schema() AS schema
  `;
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StockAdjustment'
      AND column_name = 'transactionNumber'
  `;
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260917180000_owner_walkthrough_integrity',
      '20260918140000_walkthrough_store_numbers',
      '20260918230000_shift_presentation_numbers'
    )
    ORDER BY migration_name
  `;
  return {
    currentDatabase: dbRow?.db ?? '',
    currentSchema: dbRow?.schema ?? '',
    hasTransactionNumber: columns.length === 1,
    appliedWalkthroughMigrations: migrations.map((row) => row.migration_name),
  };
}
