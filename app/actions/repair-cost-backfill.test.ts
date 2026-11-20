import {describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({salesInvoiceLine:{findMany:vi.fn(),update:vi.fn()},stockMovement:{findMany:vi.fn()},$transaction:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
vi.mock('@/lib/action-utils',()=>({withBusinessContext:vi.fn().mockResolvedValue({businessId:'business'}),safeAction:async(fn:()=>Promise<unknown>)=>{try{return await fn()}catch(e){return {success:false,error:(e as Error).message}}},ok:(data:unknown)=>({success:true,data}),UserError:Error}));
vi.mock('@/lib/cache/pos-tags',()=>({revalidatePosCatalog:vi.fn(),revalidatePosInventory:vi.fn()}));
vi.mock('@/lib/accounting',()=>({postJournalEntry:vi.fn(),ensureChartOfAccounts:vi.fn(),ACCOUNT_CODES:{}}));
vi.mock('@/lib/services/shared',()=>({splitPayments:vi.fn(),debitCashBankLines:vi.fn(),creditCashBankLines:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn(),revalidateTag:vi.fn()}));
vi.mock('@/lib/audit',()=>({audit:vi.fn()}));
vi.mock('@/lib/services/owner-sale-cleanup',()=>({cleanupOwnerVoidedSale:vi.fn()}));
vi.mock('@/lib/services/products',()=>({repairInventoryAverageCostDrift:vi.fn()}));
vi.mock('@/lib/services/payment-status-health',()=>({repairStalePaymentStatuses:vi.fn()}));
import {backfillLineCostAction} from './repair';
describe('retired legacy cost backfill',()=>{
  it('rejects stale clients before querying or mutating any historical records',async()=>{
    expect(await backfillLineCostAction()).toMatchObject({success:false,error:expect.stringContaining('disabled')});
    expect(db.salesInvoiceLine.findMany).not.toHaveBeenCalled();
    expect(db.salesInvoiceLine.update).not.toHaveBeenCalled();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
