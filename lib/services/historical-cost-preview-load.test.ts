import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  product:{findFirst:vi.fn()},store:{findFirst:vi.fn()},inventoryBalance:{findFirst:vi.fn()},
  stockMovement:{findMany:vi.fn()},purchaseInvoice:{findMany:vi.fn()},salesInvoice:{findMany:vi.fn()},journalEntry:{findMany:vi.fn()},
  $transaction:vi.fn(),
}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
import { loadHistoricalCostPreview } from './historical-cost-preview-load';
const date = new Date('2026-11-01');
const journal = (referenceId:string,referenceType:string,inventory:number,cogs:number) => ({
  referenceId,referenceType,lines:[
    {account:{code:'1200',businessId:'b'},debitPence:Math.max(inventory,0),creditPence:Math.max(-inventory,0)},
    {account:{code:'5000',businessId:'b'},debitPence:Math.max(cogs,0),creditPence:Math.max(-cogs,0)},
    {account:{code:'2000',businessId:'b'},debitPence:Math.max(-inventory-cogs,0),creditPence:Math.max(inventory+cogs,0)},
  ],
});
describe('historical cost preview loader',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    db.$transaction.mockImplementation(fn=>fn(db));
    db.product.findFirst.mockResolvedValue({name:'Rice',foodDish:null});
    db.store.findFirst.mockResolvedValue({name:'Main'});
    db.inventoryBalance.findFirst.mockResolvedValue({qtyOnHandBase:4,knownValuePence:null,unvaluedQtyBase:4});
    db.purchaseInvoice.findMany.mockResolvedValue([{id:'purchase',transactionNumber:'PUR-1',paymentStatus:'PAID',purchaseReturn:null,
      lines:[{id:'source',productId:'p',qtyBase:25,lineSubtotalPence:240000,allocatedCostPence:0}],
      returnCredits:[{id:'credit',businessId:'b',storeId:'s',linesJson:JSON.stringify([{lineId:'source',productId:'p',qtyBase:20,netPence:192000}])}],
    }]);
    db.stockMovement.findMany.mockResolvedValue([
      {id:'m1',createdAt:date,type:'PURCHASE',referenceType:'PURCHASE_INVOICE',referenceId:'purchase',qtyBase:25,valuePence:null,costBasis:null,beforeQtyBase:null,afterQtyBase:null},
      {id:'m2',createdAt:date,type:'PURCHASE_RETURN',referenceType:'PURCHASE_RETURN_CREDIT',referenceId:'credit',qtyBase:-20,valuePence:-192000,costBasis:'INVENTORY_VALUE_V1',beforeQtyBase:null,afterQtyBase:null},
      {id:'m3',createdAt:date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'sale',qtyBase:-1,valuePence:null,costBasis:'UNVERIFIED_STOCK_V1',beforeQtyBase:5,afterQtyBase:4},
    ]);
    db.salesInvoice.findMany.mockResolvedValue([{id:'sale',transactionNumber:'INV-1',createdAt:date,salesReturn:null,paymentStatus:'PAID',
      lines:[{id:'line',productId:'p',qtyBase:1,lineCostPence:0,costBasis:'UNVERIFIED_STOCK_V1'},{id:'other',productId:'other',qtyBase:1,lineCostPence:500,costBasis:'INVENTORY_VALUE_V1'}]}]);
    db.journalEntry.findMany.mockResolvedValue([journal('purchase','PURCHASE_INVOICE',240000,0),journal('credit','PURCHASE_RETURN_CREDIT',-192000,0),journal('sale','SALES_INVOICE',-500,500)]);
  });
  it('reconciles the whole mixed-product invoice journal and calculates only the selected product correction',async()=>{
    expect(await loadHistoricalCostPreview('b','p','s')).toMatchObject({result:{status:'REVIEWABLE',unitCost:9600,stockValue:38400,cogsDelta:9600,corrections:[{lineId:'line',proposedCost:9600}]}});
    expect(db.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'p',businessId:'b'}}));
    expect(db.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'s',businessId:'b'}}));
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({businessId:'b',storeId:'s'})}));
    expect(db.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({businessId:'b'})}));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));
  });
  it('does not load evidence for a foreign branch',async()=>{
    db.store.findFirst.mockResolvedValue(null);
    expect(await loadHistoricalCostPreview('b','p','foreign')).toBeNull();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
    expect(db.journalEntry.findMany).not.toHaveBeenCalled();
  });
  it('blocks duplicate postings or a mismatched complete invoice journal',async()=>{
    db.journalEntry.findMany.mockResolvedValue([journal('purchase','PURCHASE_INVOICE',240000,0),journal('credit','PURCHASE_RETURN_CREDIT',-192000,0),journal('sale','SALES_INVOICE',-600,600)]);
    expect(await loadHistoricalCostPreview('b','p','s')).toMatchObject({result:{status:'BLOCKED'}});
  });
  it('rejects an entered unit cost when any purchase exists',async()=>{
    expect(await loadHistoricalCostPreview('b','p','s',12800)).toMatchObject({result:{status:'BLOCKED'}});
    expect(db.journalEntry.findMany).not.toHaveBeenCalled();
  });
  it('proves opening stock from the original movement, not today’s catalogue or count',async()=>{
    db.purchaseInvoice.findMany.mockResolvedValue([]);
    const opening={id:'m-open',storeId:'s',productId:'p',createdAt:date,type:'OPENING',referenceType:'OPENING_BALANCE_INVENTORY',referenceId:'open',qtyBase:5,valuePence:null,unitCostBasePence:null,costBasis:null,beforeQtyBase:null,afterQtyBase:null};
    const sale={id:'m-sale',storeId:'s',productId:'p',createdAt:date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'sale',qtyBase:-2,valuePence:null,unitCostBasePence:9999,costBasis:'UNVERIFIED_STOCK_V1',beforeQtyBase:5,afterQtyBase:3};
    db.stockMovement.findMany.mockResolvedValueOnce([opening,sale]).mockResolvedValueOnce([opening]);
    db.inventoryBalance.findFirst.mockResolvedValue({qtyOnHandBase:3,knownValuePence:0,unvaluedQtyBase:3});
    db.salesInvoice.findMany.mockResolvedValue([{id:'sale',transactionNumber:'INV-1',createdAt:date,salesReturn:null,paymentStatus:'PAID',lines:[{id:'line',productId:'p',qtyBase:2,lineCostPence:0,costBasis:'UNVERIFIED_STOCK_V1'}]}]);
    db.journalEntry.findMany.mockResolvedValue([journal('sale','SALES_INVOICE',0,0)]);
    expect(await loadHistoricalCostPreview('b','p','s',12800)).toMatchObject({result:{status:'REVIEWABLE',unitCost:12800,stockValue:38400,cogsDelta:25600,source:{qty:5,value:64000,opening:{needsValue:true,movementId:'m-open',date}}}});
    db.stockMovement.findMany.mockResolvedValueOnce([{...opening,valuePence:64000},sale]).mockResolvedValueOnce([{...opening,valuePence:64000}]);
    expect(await loadHistoricalCostPreview('b','p','s',12800)).toMatchObject({result:{status:'BLOCKED'}});
  });
  it('uses already-valued opening records and rejects an owner-entered replacement cost',async()=>{
    db.purchaseInvoice.findMany.mockResolvedValue([]);
    const opening={id:'m-open',storeId:'s',productId:'p',createdAt:date,type:'OPENING',referenceType:'OPENING_BALANCE_INVENTORY',referenceId:'open',qtyBase:5,valuePence:64000,unitCostBasePence:12800,costBasis:'INVENTORY_VALUE_V1',beforeQtyBase:null,afterQtyBase:null};
    const sale={id:'m-sale',storeId:'s',productId:'p',createdAt:date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'sale',qtyBase:-2,valuePence:null,unitCostBasePence:null,costBasis:'UNVERIFIED_STOCK_V1',beforeQtyBase:5,afterQtyBase:3};
    db.stockMovement.findMany.mockResolvedValueOnce([opening,sale]).mockResolvedValueOnce([opening]);
    db.inventoryBalance.findFirst.mockResolvedValue({qtyOnHandBase:3,knownValuePence:null,unvaluedQtyBase:3});
    db.salesInvoice.findMany.mockResolvedValue([{id:'sale',transactionNumber:'INV-1',createdAt:date,salesReturn:null,paymentStatus:'PAID',lines:[{id:'line',productId:'p',qtyBase:2,lineCostPence:0,costBasis:'UNVERIFIED_STOCK_V1'}]}]);
    db.journalEntry.findMany.mockResolvedValue([{referenceId:'open',referenceType:'OPENING_BALANCE_INVENTORY',lines:[
      {account:{code:'1200',businessId:'b'},debitPence:64000,creditPence:0},
      {account:{code:'3200',businessId:'b'},debitPence:0,creditPence:64000},
    ]},journal('sale','SALES_INVOICE',0,0)]);
    expect(await loadHistoricalCostPreview('b','p','s')).toMatchObject({result:{status:'REVIEWABLE',unitCost:12800,stockValue:38400,cogsDelta:25600,source:{opening:{needsValue:false}}}});
    db.stockMovement.findMany.mockResolvedValueOnce([opening,sale]).mockResolvedValueOnce([opening]);
    expect(await loadHistoricalCostPreview('b','p','s',9999)).toMatchObject({result:{status:'BLOCKED',reason:'Opening stock already has a recorded cost. Use the recorded value instead.'}});
  });
});
