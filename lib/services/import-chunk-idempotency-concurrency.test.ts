/**
 * Overlapping-transaction concurrency evidence for import-chunk MoneyIdempotency.
 *
 * Requires a real Postgres DATABASE_URL. Without it these tests are skipped.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { buildImportChunkKey } from '@/lib/import/import-chunk-identity';
import {
  findMoneyIdempotency,
  insertMoneyIdempotency,
} from '@/lib/services/money-idempotency';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('import chunk overlapping MoneyIdempotency (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `imp-conc-${Date.now()}`;
  let homeBusinessId = '';
  let otherBusinessId = '';
  let sharedKey = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    prisma = new PrismaClient();
    await prisma.$connect();

    const home = await prisma.business.create({
      data: { name: `Imp Home ${suffix}`, currency: 'GHS' },
    });
    const other = await prisma.business.create({
      data: { name: `Imp Other ${suffix}`, currency: 'GHS' },
    });
    homeBusinessId = home.id;
    otherBusinessId = other.id;
    sharedKey = buildImportChunkKey({
      businessId: homeBusinessId,
      importRunId: `run-${suffix}`,
      mode: 'PURCHASES',
      operation: 'purchase-paid',
      supplierKey: 'sup-1',
      chunkIndex: 0,
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.moneyIdempotency.deleteMany({
      where: { businessId: { in: [homeBusinessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [homeBusinessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('scopes find by businessId so the same key string does not inject across tenants', async () => {
    await insertMoneyIdempotency(prisma as any, {
      businessId: homeBusinessId,
      key: sharedKey,
      payloadHash: 'hash-home',
      commandKind: 'IMPORT_CHUNK',
      resultJson: JSON.stringify({ invoiceId: 'inv-home' }),
    });

    const home = await findMoneyIdempotency(prisma as any, homeBusinessId, sharedKey);
    const injected = await findMoneyIdempotency(prisma as any, otherBusinessId, sharedKey);
    expect(home?.businessId).toBe(homeBusinessId);
    expect(injected).toBeNull();

    await insertMoneyIdempotency(prisma as any, {
      businessId: otherBusinessId,
      key: sharedKey,
      payloadHash: 'hash-other',
      commandKind: 'IMPORT_CHUNK',
      resultJson: JSON.stringify({ invoiceId: 'inv-other' }),
    });
    const other = await findMoneyIdempotency(prisma as any, otherBusinessId, sharedKey);
    expect(other?.payloadHash).toBe('hash-other');
    expect(other?.businessId).toBe(otherBusinessId);
  });

  it('concurrent inserts of the same businessId+key produce exactly one row', async () => {
    const raceKey = buildImportChunkKey({
      businessId: homeBusinessId,
      importRunId: `race-${suffix}`,
      mode: 'PURCHASES',
      operation: 'purchase-paid',
      supplierKey: 'sup-1',
      chunkIndex: 1,
    });

    const results = await Promise.allSettled([
      insertMoneyIdempotency(prisma as any, {
        businessId: homeBusinessId,
        key: raceKey,
        payloadHash: 'hash-a',
        commandKind: 'IMPORT_CHUNK',
        resultJson: JSON.stringify({ invoiceId: 'inv-a' }),
      }),
      insertMoneyIdempotency(prisma as any, {
        businessId: homeBusinessId,
        key: raceKey,
        payloadHash: 'hash-a',
        commandKind: 'IMPORT_CHUNK',
        resultJson: JSON.stringify({ invoiceId: 'inv-a' }),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(
      await prisma.moneyIdempotency.count({
        where: { businessId: homeBusinessId, key: raceKey },
      }),
    ).toBe(1);
  });
});
