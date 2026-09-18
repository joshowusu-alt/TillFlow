/**
 * Live Postgres proof that document-number reservation is serialised.
 * Preview proof binds POSTGRES_PRISMA_URL before constructing PrismaClient.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { DocumentSequenceName } from '@/lib/reliability/walkthrough-contracts';
import { reserveNextDocumentNumber } from './document-numbers';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  createBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) bindPrismaPostgresUrls(databaseUrl);
const describeConcurrency = canRun ? describe : describe.skip;

const SEQUENCES: Array<{ name: DocumentSequenceName; prefix: string }> = [
  { name: 'purchase', prefix: 'PUR-' },
  { name: 'supplier_payment', prefix: 'SPAY-' },
  { name: 'customer_receipt', prefix: 'RCPT-' },
  { name: 'expense', prefix: 'EXP-' },
  { name: 'expense_payment', prefix: 'EPAY-' },
  { name: 'stock_adjustment', prefix: 'ADJ-' },
  { name: 'stocktake', prefix: 'STK-' },
  { name: 'shift_closure', prefix: 'SHC-' },
  { name: 'cash_variance', prefix: 'VAR-' },
];

describeConcurrency('document number reservation (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `doc-num-${Date.now()}`;
  let businessId = '';
  let otherBusinessId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = createBoundPrismaClient(databaseUrl);
    await prisma.$connect();
    const business = await prisma.business.create({
      data: { name: `DocNum ${suffix}`, currency: 'GHS' },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `DocNum Other ${suffix}`, currency: 'GHS' },
    });
    otherBusinessId = other.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.businessSequence.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('issues unique numbers for every contracted sequence without tenant leakage', async () => {
    const issued = await Promise.all(
      SEQUENCES.map(({ name }) =>
        Promise.all(
          Array.from({ length: 6 }, () =>
            prisma.$transaction((tx) => reserveNextDocumentNumber(tx, businessId, name)),
          ),
        ),
      ),
    );

    SEQUENCES.forEach(({ prefix }, index) => {
      const values = issued[index];
      expect(new Set(values).size).toBe(6);
      expect(values.every((value) => value.startsWith(prefix))).toBe(true);
    });

    const other = await Promise.all(
      Array.from({ length: 3 }, () =>
        prisma.$transaction((tx) => reserveNextDocumentNumber(tx, otherBusinessId, 'supplier_payment')),
      ),
    );
    expect(other.sort()).toEqual(['SPAY-000001', 'SPAY-000002', 'SPAY-000003']);
    const sequences = await prisma.businessSequence.findMany({
      where: { sequenceName: 'supplier_payment', businessId: { in: [businessId, otherBusinessId] } },
      select: { businessId: true, nextVal: true },
    });
    expect(sequences).toHaveLength(2);
    expect(sequences.find((row) => row.businessId === businessId)?.nextVal).toBe(6);
    expect(sequences.find((row) => row.businessId === otherBusinessId)?.nextVal).toBe(3);
  });
});
