import { beforeEach, describe, expect, it, vi } from 'vitest';
const db=vi.hoisted(()=>({product:{findMany:vi.fn()},salesInvoice:{findMany:vi.fn()}}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
import {getSupplierSalesReport} from './supplier-sales';
describe('supplier historical profit',()=>{
  const options={start:new Date('2026-10-01'),end:new Date('2026-11-01'),storeIds:['store'],categoryId:'category',divisionId:'division',groupId:'group'};
  const line={productId:'book',qtyBase:2,qtyInUnit:2,lineSubtotalPence:2000,lineDiscountPence:100,promoDiscountPence:0,lineVatPence:190,lineTotalPence:2090,lineCostPence:1200,costBasis:'INVENTORY_VALUE_V1'};
  beforeEach(()=>{vi.clearAllMocks();db.product.findMany.mockResolvedValue([{id:'book',name:'Book',sku:'B',preferredSupplierId:'supplier',preferredSupplier:{id:'supplier',name:'Bishop'}}]);db.salesInvoice.findMany.mockResolvedValue([{id:'sale',paymentStatus:'PAID',discountPence:0,vatPence:190,totalPence:2090,lines:[line]}]);});
  it('uses historical sale cost and net sales after discounts, excluding tax',async()=>{
    const result=await getSupplierSalesReport('business',options);
    expect(result.rows[0]).toMatchObject({netRevenuePence:1900,costPence:1200,profitPence:700,totalRevenuePence:2090,totalQtyBase:2});
    expect(result.rows[0].products[0].profitPence).toBe(700);
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({businessId:'business',categoryId:'category',groupId:'group',group:{divisionId:'division'}})}));
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({businessId:'business',storeId:'store',createdAt:{gte:options.start,lt:options.end},paymentStatus:{notIn:['RETURNED','VOID']}})}));
  });
  it('leaves profit incomplete when historical cost is unverified',async()=>{
    db.salesInvoice.findMany.mockResolvedValue([{id:'sale',paymentStatus:'PAID',discountPence:0,vatPence:190,totalPence:2090,lines:[{...line,costBasis:'UNVERIFIED_STOCK_V1'}]}]);
    const result=await getSupplierSalesReport('business',options);
    expect(result.rows[0]).toMatchObject({costPence:null,profitPence:null,marginPercent:null});
  });
  it('allocates an invoice discount over every line before filtering suppliers',async()=>{
    db.salesInvoice.findMany.mockResolvedValue([{id:'sale',paymentStatus:'PAID',discountPence:200,vatPence:0,totalPence:3800,lines:[{...line,lineSubtotalPence:2000,lineDiscountPence:0,lineVatPence:0,lineTotalPence:2000},{...line,productId:'other',lineSubtotalPence:2000,lineDiscountPence:0,lineVatPence:0,lineTotalPence:2000}]}]);
    const result=await getSupplierSalesReport('business',options);
    expect(result.rows[0]).toMatchObject({netRevenuePence:1900,profitPence:700,totalRevenuePence:1900});
  });
});
