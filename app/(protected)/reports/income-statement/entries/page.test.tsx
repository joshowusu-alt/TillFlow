import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({open:vi.fn(),statement:vi.fn()}));
vi.mock('@/lib/entitlements/live-report',()=>({openLiveReport:mocks.open}));
vi.mock('@/lib/reports/financials',()=>({getIncomeStatementBreakdown:mocks.statement}));
import Page from './page';
describe('income statement detail access and period',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();mocks.open.mockResolvedValue({ok:true,business:{id:'business',currency:'GHS',timezone:'Africa/Accra'},decision:{appliedRange:{fromLocalDate:'2026-10-01',toLocalDate:'2026-10-20'}}});
    mocks.statement.mockResolvedValue({revenue:900,cogs:400,grossProfit:500,otherExpenses:200,otherOperatingIncome:0,netProfit:300,entries:[{id:'sale:one',kind:'sale',date:'2026-10-02T12:00:00Z',label:'SAL-001',description:'Sale',href:'/sales/one',revenuePence:900,costPence:400,profitPence:500,amountPence:0}]});
  });
  it('uses the authorised business and applied period, preserving them on the return link',async()=>{
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({businessId:'another-business',from:'2020-01-01',to:'2030-01-01',metric:'grossProfit'})}));
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({surfaceId:'income_statement'}));
    expect(mocks.statement).toHaveBeenCalledWith('business',new Date('2026-10-01T00:00:00Z'),new Date('2026-10-21T00:00:00Z'));
    expect(html).toContain('Gross profit — supporting records');expect(html).toContain('href="/sales/one"');
    expect(html).toContain('/reports/income-statement?from=2026-10-01&amp;to=2026-10-20');
  });
  it('filters only blocking receipts and links the precise affected product',async()=>{
    const statement=await mocks.statement();
    mocks.statement.mockResolvedValue({...statement,grossProfit:null,entries:[...statement.entries,{
      ...statement.entries[0],id:'bad',label:'Affected receipt',href:'/sales/bad',costPence:null,profitPence:null,
      incompleteLines:[{productId:'rice',name:'Rice',qtyBase:1,revenuePence:10500,reason:'INCOMPLETE_COSTS'}],
    }]});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'grossProfit',issues:'1'})}));
    expect(html).toContain('Affected receipt');
    expect(html).not.toContain('SAL-001');
    expect(html).toContain('/products/rice/cost-review');
    expect(html).toContain('Historical cost not confirmed');
    expect(html).toContain('2026-10-01');
  });
  it('groups repeated affected products, retains unsupported returns and links back with the applied period', async()=>{
    const statement=await mocks.statement();
    const line={productId:'rice',name:'Rice',qtyBase:1,revenuePence:14000,reason:'INCOMPLETE_COSTS'};
    const bad={...statement.entries[0],costPence:null,profitPence:null};
    mocks.statement.mockResolvedValue({...statement,grossProfit:null,entries:[
      {...bad,id:'a',label:'Receipt A',incompleteLines:[line]},
      {...bad,id:'b',label:'Receipt B',incompleteLines:[line]},
      {...bad,id:'c',label:'Return C',incompleteLines:[{...line,reason:'UNSUPPORTED_RETURN'}]},
    ]});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'grossProfit',issues:'1'})}));
    expect(html).toContain('1 product · 3 affected receipts');
    expect(html).toContain('2 affected receipts');
    expect(html).toContain('GH₵280.00');
    expect(html.match(/href="\/products\/rice\/cost-review\?/g)).toHaveLength(1);
    expect(html).toContain('Receipt A');expect(html).toContain('Receipt B');expect(html).toContain('Return C');
    expect(html).toContain('No automatic product correction');
    expect(html).toContain('from=2026-10-01&amp;to=2026-10-20&amp;metric=grossProfit');
  });
  it('does not query records when report access is denied',async()=>{
    mocks.open.mockResolvedValue({ok:false,denial:<p>Access denied</p>});
    expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');expect(mocks.statement).not.toHaveBeenCalled();
  });
  it('rejects invalid metric names before querying records',async()=>{
    await expect(Page({searchParams:Promise.resolve({metric:'toString'})})).rejects.toThrow();expect(mocks.statement).not.toHaveBeenCalled();
  });
  it('keeps the all-pages total and date range when paginating',async()=>{
    const statement=await mocks.statement();mocks.statement.mockClear();mocks.statement.mockResolvedValue({...statement,revenue:90900,entries:Array.from({length:101},(_,i)=>({...statement.entries[0],id:`sale:${i}`,label:`SAL-${i}`}))});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'revenue',page:'2'})}));
    expect(html).toContain('Page 2 of 2');expect(html).toContain('101 records');expect(html).toContain('Total across all pages');
    expect(html).toContain('metric=revenue&amp;from=2026-10-01&amp;to=2026-10-20&amp;page=1');
    expect(html).toContain('SAL-99');
  });
  it('filters an expense category to its own net records and preserves the period and pagination',async()=>{
    const statement=await mocks.statement();
    const expense={...statement.entries[0],kind:'expense',label:'Rent & rates',description:'Rent record',href:'/expenses/rent',amountPence:2};
    mocks.statement.mockResolvedValue({...statement,otherExpenses:300,entries:[
      ...Array.from({length:101},(_,i)=>({...expense,id:`rent:${i}`})),
      {...expense,id:'credit',amountPence:-2,description:'Rent reversal'},
      {...expense,id:'other',label:'Electricity',description:'Electricity only',amountPence:100},
    ]});
    const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'otherExpenses',expenseCategory:'Rent & rates',page:'2'})}));
    expect(html).toContain('Rent &amp; rates — supporting records');
    expect(html).toContain('GH₵2.00');
    expect(html).toContain('102 records');
    expect(html).toContain('expenseCategory=Rent+%26+rates&amp;page=1');
    expect(html).not.toContain('Electricity only');
    expect(html).toContain('View all expenses');
  });
  it('rejects an unavailable category and category filters on non-expense metrics',async()=>{
    await expect(Page({searchParams:Promise.resolve({metric:'otherExpenses',expenseCategory:'another tenant'})})).rejects.toThrow();
    await expect(Page({searchParams:Promise.resolve({metric:'revenue',expenseCategory:'Rent'})})).rejects.toThrow();
  });
});
