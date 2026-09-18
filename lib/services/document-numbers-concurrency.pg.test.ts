/**
 * Live Postgres proof that document-number reservation is serialised.
 * Skips only when DATABASE_URL is not Postgres. Preview proof must run this.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);
const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('document number reservation (Postgres)', () => {
  let prisma: PrismaClient;
  let reserveNextDocumentNumber: typeof import('./document-numbers').reserveNextDocumentNumber;
  const suffix = `doc-num-${Date.now()}`;
  let businessId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    ({ reserveNextDocumentNumber } = await import('./document-numbers'));
    prisma = new PrismaClient();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: { name: `DocNum ${suffix}`, currency: 'GHS' },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.businessSequence.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('issues unique SPAY and RCPT numbers under concurrent reserve', async () => {
    const [spay, rcpt] = await Promise.all([
      Promise.all(
        Array.from({ length: 8 }, () =>
          prisma.$transaction((tx) => reserveNextDocumentNumber(tx, businessId, 'supplier_payment')),
        ),
      ),
      Promise.all(
        Array.from({ length: 8 }, () =>
          prisma.$transaction((tx) => reserveNextDocumentNumber(tx, businessId, 'customer_receipt')),
        ),
      ),
    ]);

    expect(new Set(spay).size).toBe(8);
    expect(new Set(rcpt).size).toBe(8);
    expect(spay.every((value) => value.startsWith('SPAY-'))).toBe(true);
    expect(rcpt.every((value) => value.startsWith('RCPT-'))).toBe(true);
  });
});
