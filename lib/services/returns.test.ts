import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Mock action-utils early to prevent transitive import of lib/auth.ts which
// uses React.cache() — unavailable in the jsdom test environment.
vi.mock('@/lib/action-utils', () => ({
  UserError: class UserError extends Error {
    readonly isUserError = true;
    constructor(message: string) {
      super(message);
      this.name = 'UserError';
    }
  },
}));

const {
  mockFetchInventoryMap,
  mockUpsertInventoryBalance,
  mockPostJournalEntry,
  mockRecordCashDrawerEntryTx,
  mockDetectVoidFrequencyRisk,
  prismaMock,
} = vi.hoisted(() => {
  const mockFetchInventoryMap = vi.fn();
  const mockUpsertInventoryBalance = vi.fn();
  const mockPostJournalEntry = vi.fn();
  const mockRecordCashDrawerEntryTx = vi.fn();
  const mockDetectVoidFrequencyRisk = vi.fn();

  const prismaMock = {
    salesInvoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    salesReturn: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: { findFirst: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };

  return {
    mockFetchInventoryMap,
    mockUpsertInventoryBalance,
    mockPostJournalEntry,
    mockRecordCashDrawerEntryTx,
    mockDetectVoidFrequencyRisk,
    prismaMock,
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/services/shared', () => ({
  buildQtyByProductMap: (lines: { productId: string; qtyBase: number }[]) => {
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.qtyBase);
    }
    return map;
  },
  fetchInventoryMap: mockFetchInventoryMap,
  resolveAvgCost: (_map: unknown, _id: unknown, defaultCost: number) => defaultCost,
  upsertInventoryBalance: mockUpsertInventoryBalance,
  // Export any other symbols the module re-exports (payment-utils, etc.)
  filterPositivePayments: vi.fn(),
  splitPayments: vi.fn(),
  derivePaymentStatus: vi.fn(),
  debitCashBankLines: vi.fn(),
  creditCashBankLines: vi.fn(),
  decrementInventoryBalance: vi.fn(),
  incrementInventoryBalance: vi.fn(),
}));

vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    ar: '1100',
    inventory: '1200',
    vatReceivable: '1300',
    ap: '2000',
    vatPayable: '2100',
    equity: '3000',
    sales: '4000',
    cogs: '5000',
    operatingExpenses: '6000',
  },
  postJournalEntry: mockPostJournalEntry,
}));

vi.mock('@/lib/services/cash-drawer', () => ({
  recordCashDrawerEntryTx: mockRecordCashDrawerEntryTx,
}));

vi.mock('@/lib/services/risk-monitor', () => ({
  detectVoidFrequencyRisk: mockDetectVoidFrequencyRisk,
}));

// Import AFTER mocks
import { createSalesReturn } from './returns';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    businessId: 'biz-1',
    storeId: 'store-1',
    tillId: 'till-1',
    shiftId: 'shift-1',
    totalPence: 5000,
    subtotalPence: 4500,
    vatPence: 0,
    paymentStatus: 'PAID',
    business: { vatEnabled: false },
    store: {},
    payments: [{ method: 'CASH', amountPence: 5000 }],
    lines: [
      { productId: 'prod-1', qtyBase: 2, product: { defaultCostBasePence: 1000 } },
    ],
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: 'biz-1',
    salesInvoiceId: 'inv-1',
    userId: 'user-1',
    reasonCode: 'WRONG_ITEM',
    refundMethod: 'CASH' as const,
    refundAmountPence: 5000,
    type: 'RETURN' as const,
    managerApprovedByUserId: 'mgr-1',
    ...overrides,
  };
}

const CREATED_RETURN = { id: 'ret-1', salesInvoiceId: 'inv-1' };
const MANAGER_USER = { id: 'mgr-1' };

function setupSuccessfulMocks(invoice = makeInvoice()) {
  prismaMock.salesInvoice.findFirst.mockResolvedValue(invoice);
  prismaMock.user.findFirst.mockResolvedValue(MANAGER_USER);
  prismaMock.salesReturn.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
    fn(prismaMock)
  );
  prismaMock.salesReturn.create.mockResolvedValue(CREATED_RETURN);
  prismaMock.salesInvoice.update.mockResolvedValue({});
  prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
  mockFetchInventoryMap.mockResolvedValue(
    new Map([['prod-1', { qtyOnHandBase: 10, avgCostBasePence: 1000 }]])
  );
  mockUpsertInventoryBalance.mockResolvedValue(undefined);
  mockPostJournalEntry.mockResolvedValue(undefined);
  mockRecordCashDrawerEntryTx.mockResolvedValue(undefined);
  mockDetectVoidFrequencyRisk.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createSalesReturn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. full paid RETURN — SalesReturn.create called with correct refundAmountPence', async () => {
    setupSuccessfulMocks();

    await createSalesReturn(makeInput());

    expect(prismaMock.salesReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundAmountPence: 5000,
          refundMethod: 'CASH',
          type: 'RETURN',
        }),
      })
    );
    expect(mockPostJournalEntry).toHaveBeenCalledTimes(1);
  });

  it('1b. full paid RETURN — inventory upserted with original qty restored', async () => {
    setupSuccessfulMocks();

    await createSalesReturn(makeInput());

    // onHand (10) + returned qtyBase (2) = 12
    expect(mockUpsertInventoryBalance).toHaveBeenCalledWith(
      prismaMock,
      'store-1',
      'prod-1',
      12,
      1000
    );
  });

  it('2. VOID — refundAmountPence is 0 and no cash drawer entry recorded', async () => {
    setupSuccessfulMocks();

    await createSalesReturn(makeInput({ type: 'VOID' }));

    expect(prismaMock.salesReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundAmountPence: 0,
          refundMethod: null,
          type: 'VOID',
        }),
      })
    );
    expect(mockRecordCashDrawerEntryTx).not.toHaveBeenCalled();
  });

  it('3. partial refund — capped at totalPaid when requested amount exceeds it', async () => {
    const inv = makeInvoice({
      totalPence: 10000,
      subtotalPence: 9000,
      payments: [{ method: 'CASH', amountPence: 5000 }],
    });
    setupSuccessfulMocks(inv);

    // Request refund of 8000, but totalPaid is only 5000 → should be capped to 5000
    await createSalesReturn(makeInput({ refundAmountPence: 8000 }));

    expect(prismaMock.salesReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundAmountPence: 5000 }),
      })
    );
  });

  it('4. duplicate return rejected — throws when salesReturn.findUnique finds existing', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(makeInvoice());
    prismaMock.user.findFirst.mockResolvedValue(MANAGER_USER);
    prismaMock.salesReturn.findUnique.mockResolvedValue({ id: 'existing-ret' });

    await expect(createSalesReturn(makeInput())).rejects.toThrow('Sale already returned');
  });

  it('5. manager approval required — throws UserError when managerApprovedByUserId is absent', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(makeInvoice());

    await expect(
      createSalesReturn(makeInput({ managerApprovedByUserId: null }))
    ).rejects.toThrow('Manager approval is required');
  });

  it('6. inventory restored — upsertInventoryBalance called with qty added back', async () => {
    const inv = makeInvoice({
      lines: [{ productId: 'prod-2', qtyBase: 5, product: { defaultCostBasePence: 2000 } }],
    });
    setupSuccessfulMocks(inv);
    mockFetchInventoryMap.mockResolvedValue(
      new Map([['prod-2', { qtyOnHandBase: 3, avgCostBasePence: 2000 }]])
    );

    await createSalesReturn(makeInput());

    // onHand (3) + returned qty (5) = 8
    expect(mockUpsertInventoryBalance).toHaveBeenCalledWith(
      prismaMock,
      'store-1',
      'prod-2',
      8,
      2000
    );
  });
});
