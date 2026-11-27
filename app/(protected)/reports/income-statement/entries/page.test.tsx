import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({open:vi.fn(),statement:vi.fn()}));
vi.mock('@/lib/entitlements/live-report',()=>({openLiveReport:mocks.open}));
vi.mock('@/lib/reports/financials',()=>({getIncomeStatementBreakdown:mocks.statement}));
vi.mock('@/components/reports/OneScreenCostFix',()=>({default:vi.fn()}));
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
    expect(html).toContain('Cost of earlier sale not confirmed');
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
    expect(html).toContain('2 sales missing a cost');
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
  it('shows original operating expense notes and stock adjustment source details without reclassifying the figures',async()=>{
    const statement=await mocks.statement();
    const expense={...statement.entries[0],id:'expense',kind:'expense',label:'Operating Expenses',description:'Expense posted',href:'/expenses/one',amountPence:200,source:{title:'Electricity payment',details:['Payee: Power supplier'],reference:'EXP-1'}};
    const gain={...expense,id:'gain',kind:'other-income',label:'Inventory Gain & Surplus',amountPence:500,href:null,source:{title:'Stock found',details:['Product: Rice','Branch: Main'],reference:'ADJ-1',nonCash:true}};
    mocks.statement.mockResolvedValue({...statement,otherOperatingIncome:300,entries:[expense,gain,{...gain,id:'reverse',amountPence:-200,source:{...gain.source,title:'Stock adjustment reversal'}}]});
    const income=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'otherOperatingIncome',incomeCategory:'Inventory Gain & Surplus'})}));
    expect(income).toContain('GH₵3.00');expect(income).toContain('Stock found');expect(income).toContain('Stock adjustment reversal');
    expect(income).toContain('Product: Rice');expect(income).toContain('ADJ-1');expect(income).toContain('Stock value adjustment — not cash received or paid.');
    expect(income).not.toContain('Electricity payment');
    const expenses=renderToStaticMarkup(await Page({searchParams:Promise.resolve({metric:'otherExpenses',expenseCategory:'Operating Expenses'})}));
    expect(expenses).toContain('Electricity payment');expect(expenses).toContain('Payee: Power supplier');expect(expenses).toContain('/expenses/one');
    expect(expenses).toContain('Running costs');expect(expenses).toContain('Reference details');expect(expenses).not.toContain('Posted entry:');
    expect(expenses).not.toContain('Stock found');
    await expect(Page({searchParams:Promise.resolve({metric:'otherExpenses',incomeCategory:'Inventory Gain & Surplus'})})).rejects.toThrow();
  });
});
