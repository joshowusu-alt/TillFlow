import { prisma } from '@/lib/prisma';

type SqliteDateColumn = {
  table: string;
  column: string;
};

const REPORT_DATE_COLUMNS: SqliteDateColumn[] = [
  { table: 'SalesInvoice', column: 'createdAt' },
  { table: 'SalesPayment', column: 'receivedAt' },
  { table: 'Expense', column: 'createdAt' },
  { table: 'Shift', column: 'openedAt' },
  { table: 'Shift', column: 'closedAt' },
  { table: 'PurchaseInvoice', column: 'createdAt' },
  { table: 'PurchasePayment', column: 'paidAt' },
  { table: 'StockAdjustment', column: 'createdAt' },
  { table: 'Customer', column: 'createdAt' },
  { table: 'RiskAlert', column: 'occurredAt' },
  { table: 'MobileMoneyCollection', column: 'initiatedAt' },
  { table: 'MobileMoneyCollection', column: 'confirmedAt' },
  { table: 'MobileMoneyCollection', column: 'updatedAt' },
];

let normalizationPromise: Promise<void> | null = null;

export function isSqliteRuntime() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  return databaseUrl.startsWith('file:') || databaseUrl.includes('.db');
}

export function coerceReportDate(value: Date | string | number | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isDateWithinRange(value: Date | string | number | null | undefined, start: Date, end: Date) {
  const parsed = coerceReportDate(value);
  return parsed ? parsed >= start && parsed <= end : false;
}

export function isDateOnOrAfter(value: Date | string | number | null | undefined, threshold: Date) {
  const parsed = coerceReportDate(value);
  return parsed ? parsed >= threshold : false;
}

export function isDateBefore(value: Date | string | number | null | undefined, threshold: Date) {
  const parsed = coerceReportDate(value);
  return parsed ? parsed < threshold : false;
}

export async function ensureSqliteReportDateColumnsNormalized() {
  if (!isSqliteRuntime()) return;
  if (normalizationPromise) return normalizationPromise;

  normalizationPromise = (async () => {
    for (const { table, column } of REPORT_DATE_COLUMNS) {
      await prisma.$executeRawUnsafe(`
        UPDATE "${table}"
        SET "${column}" = strftime(
          '%Y-%m-%dT%H:%M:%fZ',
          CASE
            WHEN "${column}" > 1000000000000 THEN "${column}" / 1000.0
            ELSE "${column}"
          END,
          'unixepoch'
        )
        WHERE typeof("${column}") = 'integer'
      `);
    }
  })().catch((error) => {
    normalizationPromise = null;
    throw error;
  });

  return normalizationPromise;
}