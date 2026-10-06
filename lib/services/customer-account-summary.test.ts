import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  customer: { findMany: vi.fn(), count: vi.fn() },
  salesInvoice: { findMany: vi.fn(), groupBy: vi.fn() },
  storefrontCustomer: { findMany: vi.fn() },
  salesPayment: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getCustomerAccountSummary, getCustomers } from './customers';

const customer = (id: string, storeId = 'A') => ({ id, name: id, storeId, phone: null, email: null, tagsJson: null, creditLimitPence: 0 });
const sale = (id: string, amount = 100, paymentStatus = 'UNPAID', paid = 0) => ({ customer: { id, name: id }, customerId: id, totalPence: amount, paymentStatus, payments: [{ amountPence: paid, status: 'CONFIRMED' }] });

beforeEach(() => {
  vi.resetAllMocks();
  db.salesInvoice.groupBy.mockResolvedValue([]);
  db.storefrontCustomer.findMany.mockResolvedValue([]);
  db.salesPayment.findMany.mockResolvedValue([]);
});

describe('customer account summary and list', () => {
  it('totals every account rather than the paginated or searched list', async () => {
    const accounts = Array.from({ length: 31 }, (_, i) => customer(`c${i}`));
    db.customer.findMany.mockImplementation(async args => args.select.name ? [accounts[30]] : accounts);
    db.customer.count.mockResolvedValue(1);
    db.salesInvoice.findMany.mockImplementation(async args => args.where.customer ? accounts.map(account => sale(account.id)) : [sale('c30')]);
    const result = await getCustomers('business', { page: 2, pageSize: 1, search: 'c30' });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].outstandingBalancePence).toBe(100);
    expect(result.accountSummary.customerCount).toBe(31);
    expect(result.accountSummary.outstandingBalancePence).toBe(3100);
    expect(result.accountSummary.customersWithBalanceCount).toBe(31);
    expect(db.customer.count).toHaveBeenCalledWith({ where: { businessId: 'business', name: { contains: 'c30', mode: 'insensitive' } } });
  });

  it('pins invoice and customer summaries to the business and customer-account branch scope', async () => {
    db.customer.findMany.mockResolvedValue([customer('local')]);
    db.salesInvoice.findMany.mockResolvedValue([sale('local', 64850)]);
    expect((await getCustomerAccountSummary('business', 'A')).outstandingBalancePence).toBe(64850);
    expect(db.customer.findMany.mock.calls[0][0].where).toEqual({ businessId: 'business', storeId: 'A' });
    expect(db.salesInvoice.findMany.mock.calls[0][0].where).toEqual({ businessId: 'business', customer: { is: { businessId: 'business', storeId: 'A' } }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } });
  });

  it('keeps BUSINESS-scoped customer balances across branches explicitly', async () => {
    db.customer.findMany.mockResolvedValue([customer('shared')]);
    db.salesInvoice.findMany.mockResolvedValue([sale('shared', 100), sale('shared', 200)]);
    expect((await getCustomerAccountSummary('business')).outstandingBalancePence).toBe(300);
    expect(db.salesInvoice.findMany.mock.calls[0][0].where.customer).toEqual({ is: { businessId: 'business' } });
  });

  it('filters balance-due accounts by confirmed net balance, not the invoice status stamp', async () => {
    db.customer.findMany.mockImplementation(async args => args.select.name ? [customer('paid-stamp-shortfall')] : [customer('paid-stamp-shortfall'), customer('unpaid-stamp-settled'), customer('credit')]);
    db.customer.count.mockResolvedValue(1);
    const sales = [sale('paid-stamp-shortfall', 100, 'PAID', 40), sale('unpaid-stamp-settled', 100, 'UNPAID', 100), sale('credit', 100, 'UNPAID', 200)];
    db.salesInvoice.findMany.mockImplementation(async args => args.where.customer ? sales : [sales[0]]);
    const result = await getCustomers('business', { balanceDue: true });
    expect(db.customer.count.mock.calls[0][0].where.id).toEqual({ in: ['paid-stamp-shortfall'] });
    expect(result.accountSummary.customersWithBalanceCount).toBe(1);
    expect(result.accountSummary.outstandingBalancePence).toBe(60);
    expect(result.accountSummary.customerCreditPence).toBe(100);
    expect(result.customers[0].outstandingBalancePence).toBe(60);
    expect(db.salesInvoice.findMany.mock.calls[0][0].where.businessId).toBe('business');
  });
});
