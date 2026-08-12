/**
 * Disposable local preview-equivalent store for Step 5B.
 * Implements the Prisma method shapes used by Money Received query/service/export.
 * Does not touch production or shared preview databases.
 */

type PaymentRow = {
  id: string;
  amountPence: number;
  method: string;
  status: string;
  receivedAt: Date;
  salesInvoiceId: string;
  salesInvoice: { businessId: string; storeId: string; paymentStatus: string };
};

type RefundRow = {
  id: string;
  type: string;
  refundAmountPence: number;
  createdAt: Date;
  salesInvoiceId: string;
  storeId: string;
  store: { businessId: string; id: string };
};

function matchScalar(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    const e = expected as Record<string, unknown>;
    if ('gte' in e || 'lt' in e || 'lte' in e || 'gt' in e) {
      const t = actual instanceof Date ? actual.getTime() : Number(actual);
      if ('gte' in e && t < new Date(e.gte as Date).getTime()) return false;
      if ('lt' in e && t >= new Date(e.lt as Date).getTime()) return false;
      if ('lte' in e && t > new Date(e.lte as Date).getTime()) return false;
      if ('gt' in e && t <= new Date(e.gt as Date).getTime()) return false;
      return true;
    }
    if ('in' in e) return (e.in as unknown[]).includes(actual);
    if ('notIn' in e) return !(e.notIn as unknown[]).includes(actual);
  }
  return actual === expected;
}

function matchInvoice(
  inv: PaymentRow['salesInvoice'],
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  if ('businessId' in where && !matchScalar(inv.businessId, where.businessId)) return false;
  if ('storeId' in where && !matchScalar(inv.storeId, where.storeId)) return false;
  if ('paymentStatus' in where && !matchScalar(inv.paymentStatus, where.paymentStatus)) return false;
  return true;
}

function matchPayment(row: PaymentRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR') {
      const ok = (val as Record<string, unknown>[]).some((clause) => matchPayment(row, clause));
      if (!ok) return false;
      continue;
    }
    if (key === 'AND') {
      const ok = (val as Record<string, unknown>[]).every((clause) => matchPayment(row, clause));
      if (!ok) return false;
      continue;
    }
    if (key === 'salesInvoice') {
      if (!matchInvoice(row.salesInvoice, val as Record<string, unknown>)) return false;
      continue;
    }
    if (key === 'status' && !matchScalar(row.status, val)) return false;
    if (key === 'method' && !matchScalar(row.method, val)) return false;
    if (key === 'receivedAt' && !matchScalar(row.receivedAt, val)) return false;
    if (key === 'amountPence' && !matchScalar(row.amountPence, val)) return false;
  }
  return true;
}

function matchRefund(row: RefundRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'store') {
      const storeWhere = val as Record<string, unknown>;
      if ('businessId' in storeWhere && !matchScalar(row.store.businessId, storeWhere.businessId)) return false;
      if ('id' in storeWhere && !matchScalar(row.store.id, storeWhere.id)) return false;
      continue;
    }
    if (key === 'type' && !matchScalar(row.type, val)) return false;
    if (key === 'createdAt' && !matchScalar(row.createdAt, val)) return false;
    if (key === 'refundAmountPence' && !matchScalar(row.refundAmountPence, val)) return false;
  }
  return true;
}

function sortBy(
  rows: any[],
  orderBy: Array<Record<string, 'asc' | 'desc'>> | Record<string, 'asc' | 'desc'> | undefined,
): any[] {
  const orders = !orderBy ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const ord of orders) {
      const [field, dir] = Object.entries(ord)[0]!;
      const av = a[field];
      const bv = b[field];
      const cmp =
        av instanceof Date
          ? av.getTime() - (bv as Date).getTime()
          : String(av).localeCompare(String(bv));
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export type PreviewCallLog = {
  model: string;
  method: string;
  args: unknown;
};

export type PreviewEquivalentDb = {
  salesPayment: {
    aggregate: (args: any) => Promise<any>;
    groupBy: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  salesReturn: {
    aggregate: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  __calls: PreviewCallLog[];
  __payments: PaymentRow[];
  __refunds: RefundRow[];
};

export function createPreviewEquivalentDb(
  payments: PaymentRow[],
  refunds: RefundRow[],
): PreviewEquivalentDb {
  const calls: PreviewCallLog[] = [];

  const db: PreviewEquivalentDb = {
    __calls: calls,
    __payments: payments,
    __refunds: refunds,
    salesPayment: {
      async aggregate(args) {
        calls.push({ model: 'salesPayment', method: 'aggregate', args });
        const matched = payments.filter((p) => matchPayment(p, args.where));
        return {
          _sum: { amountPence: matched.reduce((s, r) => s + r.amountPence, 0) },
          _count: { id: matched.length },
        };
      },
      async groupBy(args) {
        calls.push({ model: 'salesPayment', method: 'groupBy', args });
        const matched = payments.filter((p) => matchPayment(p, args.where));
        const map = new Map<string, number>();
        for (const row of matched) {
          map.set(row.method, (map.get(row.method) ?? 0) + row.amountPence);
        }
        return [...map.entries()].map(([method, amountPence]) => ({
          method,
          _sum: { amountPence },
        }));
      },
      async findMany(args) {
        calls.push({ model: 'salesPayment', method: 'findMany', args });
        let matched = payments.filter((p) => matchPayment(p, args.where));
        matched = sortBy(matched, args.orderBy);
        const skip = args.skip ?? 0;
        const take = args.take ?? matched.length;
        return matched.slice(skip, skip + take).map((p) => ({
          id: p.id,
          amountPence: p.amountPence,
          method: p.method,
          status: p.status,
          receivedAt: p.receivedAt,
          salesInvoiceId: p.salesInvoiceId,
          salesInvoice: {
            storeId: p.salesInvoice.storeId,
            businessId: p.salesInvoice.businessId,
            paymentStatus: p.salesInvoice.paymentStatus,
          },
        }));
      },
      async count(args) {
        calls.push({ model: 'salesPayment', method: 'count', args });
        return payments.filter((p) => matchPayment(p, args.where)).length;
      },
    },
    salesReturn: {
      async aggregate(args) {
        calls.push({ model: 'salesReturn', method: 'aggregate', args });
        const matched = refunds.filter((r) => matchRefund(r, args.where));
        return {
          _sum: { refundAmountPence: matched.reduce((s, r) => s + r.refundAmountPence, 0) },
          _count: { id: matched.length },
        };
      },
      async findMany(args) {
        calls.push({ model: 'salesReturn', method: 'findMany', args });
        let matched = refunds.filter((r) => matchRefund(r, args.where));
        matched = sortBy(matched, args.orderBy);
        const skip = args.skip ?? 0;
        const take = args.take ?? matched.length;
        return matched.slice(skip, skip + take).map((r) => ({
          id: r.id,
          refundAmountPence: r.refundAmountPence,
          createdAt: r.createdAt,
          salesInvoiceId: r.salesInvoiceId,
          storeId: r.storeId,
        }));
      },
      async count(args) {
        calls.push({ model: 'salesReturn', method: 'count', args });
        return refunds.filter((r) => matchRefund(r, args.where)).length;
      },
    },
  };

  return db;
}

/** Build the Step 5B required dataset (deterministic, no PII). */
export function buildStep5BDataset() {
  const bizA = 'biz-preview-a';
  const bizB = 'biz-preview-b';
  const branchA1 = 'branch-a1';
  const branchA2 = 'branch-a2';
  const branchB1 = 'branch-b1';

  const payments: PaymentRow[] = [];
  const refunds: RefundRow[] = [];

  const addPay = (row: Omit<PaymentRow, 'salesInvoice'> & { businessId: string; storeId: string; parentPaymentStatus: string }) => {
    payments.push({
      id: row.id,
      amountPence: row.amountPence,
      method: row.method,
      status: row.status,
      receivedAt: row.receivedAt,
      salesInvoiceId: row.salesInvoiceId,
      salesInvoice: {
        businessId: row.businessId,
        storeId: row.storeId,
        paymentStatus: row.parentPaymentStatus,
      },
    });
  };

  // Recognised methods — Business A branch A1 (January)
  addPay({
    id: 'pay-cash',
    amountPence: 10000,
    method: 'CASH',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T10:00:00.000Z'),
    salesInvoiceId: 'inv-cash',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });
  addPay({
    id: 'pay-momo',
    amountPence: 20000,
    method: 'MOBILE_MONEY',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T11:00:00.000Z'),
    salesInvoiceId: 'inv-momo',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });
  addPay({
    id: 'pay-card',
    amountPence: 15000,
    method: 'CARD',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T12:00:00.000Z'),
    salesInvoiceId: 'inv-card',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });
  addPay({
    id: 'pay-transfer',
    amountPence: 25000,
    method: 'TRANSFER',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T13:00:00.000Z'),
    salesInvoiceId: 'inv-transfer',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });
  addPay({
    id: 'pay-other',
    amountPence: 5000,
    method: 'CHEQUE',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T14:00:00.000Z'),
    salesInvoiceId: 'inv-other',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });

  // Excluded statuses
  for (const [id, status] of [
    ['pay-failed', 'FAILED'],
    ['pay-pending', 'PENDING'],
    ['pay-cancelled', 'CANCELLED'],
    ['pay-void-payment', 'VOID'],
  ] as const) {
    addPay({
      id,
      amountPence: 9999,
      method: 'CASH',
      status,
      receivedAt: new Date('2026-01-11T10:00:00.000Z'),
      salesInvoiceId: `inv-${id}`,
      businessId: bizA,
      storeId: branchA1,
      parentPaymentStatus: 'PAID',
    });
  }

  // Unclassified / unverified legacy
  addPay({
    id: 'pay-unverified',
    amountPence: 4500,
    method: 'CASH',
    status: 'LEGACY_RAW',
    receivedAt: new Date('2026-01-12T10:00:00.000Z'),
    salesInvoiceId: 'inv-unverified',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });

  // Confirmed receipt whose parent later RETURNED — must remain in Jan money_received
  addPay({
    id: 'pay-then-returned',
    amountPence: 20000,
    method: 'CASH',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-15T09:00:00.000Z'),
    salesInvoiceId: 'inv-returned-parent',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'RETURNED',
  });

  // Confirmed receipt whose parent is VOID sale — must remain
  addPay({
    id: 'pay-parent-void-sale',
    amountPence: 8000,
    method: 'CARD',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-16T09:00:00.000Z'),
    salesInvoiceId: 'inv-void-parent',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'VOID',
  });

  // Branch A2 isolation
  addPay({
    id: 'pay-branch-a2',
    amountPence: 3000,
    method: 'CASH',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T15:00:00.000Z'),
    salesInvoiceId: 'inv-a2',
    businessId: bizA,
    storeId: branchA2,
    parentPaymentStatus: 'PAID',
  });

  // Business B isolation
  addPay({
    id: 'pay-biz-b',
    amountPence: 77777,
    method: 'CASH',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-10T16:00:00.000Z'),
    salesInvoiceId: 'inv-b',
    businessId: bizB,
    storeId: branchB1,
    parentPaymentStatus: 'PAID',
  });

  // Timezone boundary: 00:30 Accra on 2026-01-16 (= UTC same for Accra)
  addPay({
    id: 'pay-tz-boundary',
    amountPence: 777,
    method: 'CASH',
    status: 'CONFIRMED',
    receivedAt: new Date('2026-01-16T00:30:00.000Z'),
    salesInvoiceId: 'inv-tz',
    businessId: bizA,
    storeId: branchA1,
    parentPaymentStatus: 'PAID',
  });

  // February refund for January receipt (CT01 shape)
  refunds.push({
    id: 'ref-feb',
    type: 'RETURN',
    refundAmountPence: 20000,
    createdAt: new Date('2026-02-05T12:00:00.000Z'),
    salesInvoiceId: 'inv-returned-parent',
    storeId: branchA1,
    store: { businessId: bizA, id: branchA1 },
  });

  // Bulk rows for multi-page + export > 5000 (Business A, March)
  for (let i = 0; i < 5100; i++) {
    addPay({
      id: `pay-bulk-${String(i).padStart(5, '0')}`,
      amountPence: 1,
      method: (['CASH', 'MOBILE_MONEY', 'CARD', 'TRANSFER'] as const)[i % 4],
      status: 'CONFIRMED',
      receivedAt: new Date(Date.UTC(2026, 2, 1 + (i % 28), 8, i % 60, i % 60)),
      salesInvoiceId: `inv-bulk-${i}`,
      businessId: bizA,
      storeId: branchA1,
      parentPaymentStatus: i % 11 === 0 ? 'RETURNED' : 'PAID',
    });
  }

  return {
    bizA,
    bizB,
    branchA1,
    branchA2,
    branchB1,
    payments,
    refunds,
    users: {
      ownerA: { role: 'OWNER' as const, businessId: bizA },
      managerA: { role: 'MANAGER' as const, businessId: bizA },
      cashierA: { role: 'CASHIER' as const, businessId: bizA },
      ownerB: { role: 'OWNER' as const, businessId: bizB },
    },
    authorisedStoresA: [branchA1, branchA2],
    authorisedStoresB: [branchB1],
  };
}
