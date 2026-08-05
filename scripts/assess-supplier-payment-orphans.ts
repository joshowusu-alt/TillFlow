/**
 * Read-only historical assessment: cash supplier payments vs linked drawer cash-outs.
 *
 * Performs no inserts, updates, or deletes.
 * Tenant-scoped. Does not expose customer PII.
 *
 * Usage (authorised isolated or Production read-only when separately approved):
 *   npx tsx scripts/assess-supplier-payment-orphans.ts --businessId=<id>
 *
 * Optional:
 *   --json   machine-readable aggregates only
 *
 * Do NOT run against Production unless authorised read-only connectivity already exists.
 */
import { PrismaClient } from '@prisma/client';
import {
  assessHistoricalCashSupplierPayments,
  type HistoricalCashSupplierPaymentAssessmentRow,
} from '../lib/services/cash-drawer';

function formatGhs(pence: number) {
  return `GH₵${(pence / 100).toFixed(2)}`;
}

function parseArgs(argv: string[]) {
  const businessId = argv.find((a) => a.startsWith('--businessId='))?.slice('--businessId='.length)?.trim();
  const asJson = argv.includes('--json');
  return { businessId, asJson };
}

async function main() {
  const { businessId, asJson } = parseArgs(process.argv.slice(2));
  if (!businessId) {
    console.error('Usage: npx tsx scripts/assess-supplier-payment-orphans.ts --businessId=<id> [--json]');
    process.exit(2);
  }

  const prisma = new PrismaClient({
    datasources: process.env.DATABASE_URL ? { db: { url: process.env.DATABASE_URL } } : undefined,
  });

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, currency: true },
    });
    if (!business) {
      console.error('Business not found for the provided id (existence not disclosed beyond this message).');
      process.exit(1);
    }

    const payments = await prisma.purchasePayment.findMany({
      where: {
        method: 'CASH',
        amountPence: { gt: 0 },
        OR: [
          { businessId },
          { purchaseInvoice: { businessId } },
        ],
      },
      select: {
        id: true,
        amountPence: true,
        paidAt: true,
        recordedByUserId: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    const paymentIds = payments.map((p) => p.id);
    const drawerEntries =
      paymentIds.length === 0
        ? []
        : await prisma.cashDrawerEntry.findMany({
            where: {
              businessId,
              entryType: 'PAID_OUT_SUPPLIER',
              referenceType: 'PURCHASE_PAYMENT',
              referenceId: { in: paymentIds },
            },
            select: {
              id: true,
              referenceId: true,
              shiftId: true,
              shift: { select: { status: true } },
            },
          });

    const byPayment = new Map<string, typeof drawerEntries>();
    for (const entry of drawerEntries) {
      if (!entry.referenceId) continue;
      const list = byPayment.get(entry.referenceId) ?? [];
      list.push(entry);
      byPayment.set(entry.referenceId, list);
    }

    const rows: HistoricalCashSupplierPaymentAssessmentRow[] = payments.map((payment) => {
      const links = byPayment.get(payment.id) ?? [];
      const statuses = links
        .map((l) => l.shift?.status)
        .filter((s): s is string => Boolean(s));
      let shiftStatus: HistoricalCashSupplierPaymentAssessmentRow['shiftStatus'] = null;
      if (links.length === 0) {
        shiftStatus = 'NONE';
      } else if (statuses.length === 0) {
        shiftStatus = 'NONE';
      } else if (statuses.every((s) => s === 'OPEN')) {
        shiftStatus = 'OPEN';
      } else if (statuses.every((s) => s === 'CLOSED')) {
        shiftStatus = 'CLOSED';
      } else {
        shiftStatus = 'MIXED';
      }

      return {
        id: payment.id,
        amountPence: payment.amountPence,
        paidAt: payment.paidAt,
        recordedByUserId: payment.recordedByUserId,
        linkedDrawerCount: links.length,
        shiftStatus,
      };
    });

    const aggregates = assessHistoricalCashSupplierPayments(rows);

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            readOnly: true,
            businessId: business.id,
            currency: business.currency,
            aggregates: aggregates.map((a) => ({
              ...a,
              aggregateValueFormatted: formatGhs(a.aggregateValuePence),
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('TillFlow — read-only cash supplier-payment orphan assessment');
    console.log(`Business: ${business.id}`);
    console.log('Mode: READ-ONLY (no writes)');
    console.log('');
    console.log(
      [
        'Category'.padEnd(32),
        'Count'.padStart(8),
        'Aggregate'.padStart(14),
        'Closed-shift'.padStart(14),
        'Deterministic?'.padStart(14),
      ].join(' '),
    );
    console.log('-'.repeat(86));

    const labels: Record<string, string> = {
      properly_linked: 'Properly linked',
      missing_drawer_link: 'Missing drawer link',
      duplicate_drawer_links: 'Duplicate drawer links',
      funding_source_ambiguous: 'Funding source ambiguous',
      shift_association_unavailable: 'Shift association unavailable',
    };

    for (const row of aggregates) {
      console.log(
        [
          (labels[row.category] ?? row.category).padEnd(32),
          String(row.recordCount).padStart(8),
          formatGhs(row.aggregateValuePence).padStart(14),
          String(row.closedShiftExposureCount).padStart(14),
          (row.deterministic ? 'yes' : 'no').padStart(14),
        ].join(' '),
      );
    }

    console.log('');
    console.log('Notes:');
    console.log('- Missing idempotency keys are not treated as orphans.');
    console.log('- Ambiguous funding is not classified as a confirmed orphan.');
    console.log('- No automatic remediation is proposed or performed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
