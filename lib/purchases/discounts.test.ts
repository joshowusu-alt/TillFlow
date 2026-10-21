import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{}}));
import { pricePurchaseLines, purchaseDiscountBps } from './discounts';
import { buildPurchaseCreatePayloadHash } from '@/lib/services/money-idempotency';
describe('purchase percentage discounts', () => {
  it('applies invoice percentage after item discounts', () => {
    expect(pricePurchaseLines([{qtyInUnit:2,unitCostPence:1000,discountBps:1000},{qtyInUnit:1,unitCostPence:200}],500)).toEqual([
      {grossPence:2000,discountPence:290,netPence:1710},
      {grossPence:200,discountPence:10,netPence:190},
    ]);
  });
  it('allocates penny remainders deterministically without losing value', () => {
    const rows=pricePurchaseLines(Array.from({length:3},()=>({qtyInUnit:1,unitCostPence:1})),5000);
    expect(rows.map(row=>row.netPence)).toEqual([0,0,1]);
    expect(rows.reduce((sum,row)=>sum+row.discountPence+row.netPence,0)).toBe(3);
  });
  it('handles free goods and 100 percent discount', () => {
    expect(pricePurchaseLines([{qtyInUnit:1,unitCostPence:0},{qtyInUnit:3,unitCostPence:19}],10000).map(row=>row.netPence)).toEqual([0,0]);
  });
  it('rejects invalid percentages, fractional counts and excessive values', () => {
    for(const value of ['-1','100.01','1.001','NaN'])expect(()=>purchaseDiscountBps(value)).toThrow();
    expect(purchaseDiscountBps('12.50')).toBe(1250);
    expect(()=>pricePurchaseLines([{qtyInUnit:1.2,unitCostPence:100}])).toThrow();
    expect(()=>pricePurchaseLines([{qtyInUnit:2,unitCostPence:2147483647}])).toThrow();
  });
  it('keeps legacy replay hashes stable but detects discount or document-type changes', () => {
    const input={businessId:'business',storeId:'store',supplierId:'supplier',userId:'owner',payments:[],lines:[{productId:'book',unitId:'unit',qtyInUnit:1,unitCostPence:1000}]};
    const baseline=buildPurchaseCreatePayloadHash(input);
    expect(buildPurchaseCreatePayloadHash({...input,discountBps:0,receiptDocumentType:'INVOICE'})).toBe(baseline);
    expect(buildPurchaseCreatePayloadHash({...input,discountBps:1000})).not.toBe(baseline);
    expect(buildPurchaseCreatePayloadHash({...input,lines:[{...input.lines[0],discountBps:1000}]})).not.toBe(baseline);
    expect(buildPurchaseCreatePayloadHash({...input,receiptDocumentType:'DELIVERY_NOTE'})).not.toBe(baseline);
  });
});
