import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({$transaction:vi.fn(),salesInvoice:{findMany:vi.fn()},account:{findMany:vi.fn()},journalLine:{groupBy:vi.fn(),findMany:vi.fn()}}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn}));
vi.mock('@/lib/reports/incomplete-stock',()=>({getIncompleteStockSnapshot:vi.fn().mockResolvedValue({stockValueIncomplete:false,profitMayBeIncomplete:false}),incompleteStockDisclosureMessage:()=>null}));
import {getIncomeStatementBreakdown} from './financials';
import {incomeStatementEntriesHref,isIncomeStatementMetric,selectIncomeStatementEntries} from './income-statement-breakdown';

describe('income statement supporting records',()=>{
  const start=new Date('2026-10-01T00:00:00Z'),end=new Date('2026-11-01T00:00:00Z');
  const sale={id:'sale',transactionNumber:'SAL-1',createdAt:new Date('2026-10-03T12:00:00Z'),paymentStatus:'PAID',discountPence:100,salesReturn:null,lines:[{qtyBase:1,lineSubtotalPence:1000,lineDiscountPence:0,promoDiscountPence:0,lineCostPence:400,costBasis:'INVENTORY_VALUE_V1',product:{defaultCostBasePence:9999}}]};
  beforeEach(()=>{
    vi.clearAllMocks();db.$transaction.mockImplementation(fn=>fn(db));db.salesInvoice.findMany.mockResolvedValue([sale]);
    db.account.findMany.mockResolvedValue([{id:'sales',code:'4000',type:'INCOME',name:'Sales'},{id:'cogs',code:'5000',type:'EXPENSE',name:'Product costs'},{id:'rent',code:'6000',type:'EXPENSE',name:'Rent'},{id:'gain',code:'4100',type:'INCOME',name:'Inventory gain'}]);
    db.journalLine.groupBy.mockResolvedValue([{accountId:'rent',_sum:{debitPence:200,creditPence:0}},{accountId:'gain',_sum:{debitPence:0,creditPence:50}}]);
    db.journalLine.findMany.mockResolvedValue([
      {id:'expense-line',accountId:'rent',debitPence:200,creditPence:0,journalEntry:{id:'expense-journal',entryDate:start,description:'October rent',referenceType:'EXPENSE',referenceId:'expense'}},
      {id:'gain-line',accountId:'gain',debitPence:0,creditPence:50,journalEntry:{id:'gain-journal',entryDate:start,description:'Stock gain',referenceType:'STOCK_ADJUSTMENT',referenceId:'adjustment'}},
    ]);
  });
  it('reconciles every metric to its own supporting records without using current product costs',async()=>{
    const result=await getIncomeStatementBreakdown('business',start,end);
    expect(result).toMatchObject({revenue:900,cogs:400,grossProfit:500,otherExpenses:200,otherOperatingIncome:50,netProfit:350});
    for(const metric of ['revenue','cogs','grossProfit','otherExpenses','otherOperatingIncome','netProfit'] as const){
      expect(selectIncomeStatementEntries(result.entries,metric).reduce((sum,row)=>sum+(row.contributionPence??0),0)).toBe(result[metric]);
    }
    expect(selectIncomeStatementEntries(result.entries,'netProfit')).toEqual(expect.arrayContaining([expect.objectContaining({href:'/expenses/expense',contributionPence:-200}),expect.objectContaining({href:'/sales/sale',contributionPence:500})]));
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{businessId:'business',createdAt:{gte:start,lt:end}}}));
    expect(db.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({account:expect.objectContaining({businessId:'business'}),journalEntry:{businessId:'business',entryDate:{gte:start,lt:end}}})}));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));
  });
  it('retains incomplete historical costs in both totals and detail',async()=>{
    db.salesInvoice.findMany.mockResolvedValue([{...sale,lines:[{...sale.lines[0],costBasis:'UNVERIFIED_STOCK_V1'}]}]);
    const result=await getIncomeStatementBreakdown('business',start,end);
    expect(result).toMatchObject({cogs:null,grossProfit:null,netProfit:null,revenue:900});
    expect(selectIncomeStatementEntries(result.entries,'cogs')[0]).toMatchObject({contributionPence:null,href:'/sales/sale'});
  });
  it('excludes full returns and voids from both sources and totals',async()=>{
    db.salesInvoice.findMany.mockResolvedValue([{...sale,paymentStatus:'RETURNED',salesReturn:{type:'RETURN'}},{...sale,id:'void',paymentStatus:'VOID',salesReturn:{type:'VOID'}}]);
    const result=await getIncomeStatementBreakdown('business',start,end);
    expect(result.revenue).toBe(0);expect(selectIncomeStatementEntries(result.entries,'revenue')).toEqual([]);
  });
  it('shows expense reversals as decreases rather than new spending',async()=>{
    db.journalLine.groupBy.mockResolvedValue([{accountId:'rent',_sum:{debitPence:200,creditPence:50}}]);
    db.journalLine.findMany.mockResolvedValue([{id:'rent',accountId:'rent',debitPence:200,creditPence:0,journalEntry:{entryDate:start,description:'Rent',referenceType:'EXPENSE',referenceId:'expense'}},{id:'reversal',accountId:'rent',debitPence:0,creditPence:50,journalEntry:{entryDate:end,description:'Reversal',referenceType:'REVERSAL',referenceId:null}}]);
    const result=await getIncomeStatementBreakdown('business',start,end);
    expect(selectIncomeStatementEntries(result.entries,'otherExpenses').reduce((sum,row)=>sum+row.contributionPence!,0)).toBe(150);
  });
  it('validates metric names and preserves period links',()=>{
    expect(isIncomeStatementMetric('toString')).toBe(false);expect(isIncomeStatementMetric('netProfit')).toBe(true);
    expect(incomeStatementEntriesHref('cogs','2026-10-01','2026-10-20')).toBe('/reports/income-statement/entries?metric=cogs&from=2026-10-01&to=2026-10-20');
  });
});
