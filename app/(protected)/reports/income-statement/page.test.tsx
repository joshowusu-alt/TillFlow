import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({open:vi.fn(),statement:vi.fn(),breakdown:vi.fn()}));
vi.mock('@/lib/entitlements/live-report',()=>({openLiveReport:mocks.open}));
vi.mock('@/lib/reports/financials',()=>({getIncomeStatement:mocks.statement,getIncomeStatementBreakdown:mocks.breakdown}));
vi.mock('@/components/DownloadLink',()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
vi.mock('@/components/reports/ReportsRefresh',()=>({default:()=>null}));
import Page from './page';
describe('income statement drilldown links',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.open.mockResolvedValue({ok:true,business:{id:'business',currency:'GHS',timezone:'Africa/Accra'},branch:{kind:'label',label:'Whole business'},decision:{appliedRange:{fromLocalDate:'2026-10-01',toLocalDate:'2026-10-20'}}});mocks.statement.mockResolvedValue({revenue:900,cogs:400,grossProfit:500,otherExpenses:200,otherOperatingIncome:50,netProfit:350,incompleteLineCount:0,entries:[{id:'rent',kind:'expense',date:'2026-10-03T12:00:00Z',label:'Rent',description:'Rent',href:'/expenses/rent',amountPence:200,revenuePence:0,costPence:0,profitPence:0}]});mocks.breakdown.mockImplementation(()=>mocks.statement());});
  it('links every figure to supporting records in the same period',async()=>{
    const html=renderToStaticMarkup(await Page({}));
    for(const metric of ['revenue','cogs','grossProfit','netProfit','otherExpenses','otherOperatingIncome'])expect(html).toContain(`/reports/income-statement/entries?metric=${metric}&amp;from=2026-10-01&amp;to=2026-10-20`);
  });
  it('explains zero food costs when a food business has sales and keeps the message off retail reports',async()=>{
    const opened = await mocks.open();
    const statement = {...await mocks.statement(), foodCosts:0, foodWaste:0};
    mocks.statement.mockResolvedValue(statement);
    expect(renderToStaticMarkup(await Page({}))).not.toContain('No food costs are showing');
    mocks.open.mockResolvedValue({...opened,business:{...opened.business,businessCategory:'FOOD_DISHES'}});
    expect(renderToStaticMarkup(await Page({}))).toContain('No food costs are showing');
    mocks.statement.mockResolvedValue({...statement,foodCosts:100});
    expect(renderToStaticMarkup(await Page({}))).not.toContain('No food costs are showing');
  });
  it('links incomplete profit to the period-filtered affected sales and separates stock review',async()=>{
    mocks.statement.mockResolvedValue({...await mocks.statement(),cogs:null,grossProfit:null,netProfit:null,incompleteLineCount:3,stockValueIncomplete:true,incompleteStockMessage:'607 products in stock have no cost yet, so stock value is not complete.',entries:[{kind:'sale',profitPence:null,incompleteLines:[{reason:'INCOMPLETE_COSTS'},{reason:'INCOMPLETE_COSTS'}]},{kind:'sale',profitPence:null,incompleteLines:[{reason:'INCOMPLETE_COSTS'}]}]});
    const html=renderToStaticMarkup(await Page({}));
    expect(html).toContain('metric=grossProfit&amp;from=2026-10-01&amp;to=2026-10-20&amp;issues=1');
    expect(html).toContain('2 sales have unconfirmed historical product costs');
    expect(html).not.toContain('/products?issue=MISSING_COST');
    expect(mocks.breakdown).toHaveBeenCalledTimes(1);
  });
  it('does not load the snapshot if access is denied',async()=>{
    mocks.open.mockResolvedValue({ok:false,denial:<p>Access denied</p>});expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');expect(mocks.statement).not.toHaveBeenCalled();expect(mocks.breakdown).not.toHaveBeenCalled();
  });
  it('renders one summary with the original figures and neutral stock-only warning', async () => {
    const statement = await mocks.statement();
    const complete = renderToStaticMarkup(await Page({}));
    for (const [label, value] of [['Sales','9.00'], ['Cost of goods sold','4.00'], ['Gross profit','5.00'], ['Expenses','2.00'], ['Other income','0.50'], ['Profit','3.50']]) {
      expect(complete).toContain(`View ${label} supporting records: GH₵${value}`);
    }
    expect(complete.match(/metric=revenue/g)).toHaveLength(1);
    expect(complete).not.toContain('Add cost');
    expect(complete).not.toContain('Profit is incomplete');
    expect(mocks.breakdown).toHaveBeenCalledTimes(1);
    mocks.statement.mockResolvedValue({...statement, stockValueIncomplete:true, incompleteStockMessage:'1 product in stock has no cost yet, so stock value is not complete.'});
    const stock = renderToStaticMarkup(await Page({}));
    expect(stock).toContain('This does not change this period');
    expect(stock).toContain('/products?issue=MISSING_COST');
    expect(stock).not.toContain('Cost Resolution Centre');
    expect(stock).not.toContain('Review stock and earlier sale costs');
    expect(stock.indexOf('1 product in stock')).toBeGreaterThan(stock.indexOf('Tap any amount'));
  });
  it('keeps the whole-business label only when there are several branches and defaults to month-to-date', async () => {
    const opened = await mocks.open();
    mocks.open.mockResolvedValue({...opened,stores:[{id:'one'}]});
    expect(renderToStaticMarkup(await Page({}))).not.toContain('Whole business — not separated by branch');
    mocks.open.mockResolvedValue({...opened,stores:[{id:'one'},{id:'two'}]});
    expect(renderToStaticMarkup(await Page({}))).toContain('Whole business — not separated by branch');
    const range = mocks.open.mock.calls.at(-1)![0].range;
    expect(range({timezone:'Africa/Accra',now:new Date('2026-11-26T12:00:00Z')})).toEqual({fromLocalDate:'2026-11-01',toLocalDate:'2026-11-26',preset:'MONTH_TO_DATE'});
  });
  it('shows categories, net reversals and the unchanged total before Profit', async () => {
    const statement = await mocks.statement();
    const rent = statement.entries[0];
    mocks.statement.mockResolvedValue({...statement, entries:[
      {...rent,amountPence:150},
      {...rent,id:'rent-reversal',amountPence:-25},
      {...rent,id:'utility',label:'Electricity & water',amountPence:75},
      {...rent,id:'food',kind:'food-cost',label:'Food costs',amountPence:999},
    ]});
    const html=renderToStaticMarkup(await Page({}));
    expect(html).toContain('View Rent expense records: GH₵1.25');
    expect(html).toContain('View Electricity &amp; water expense records: GH₵0.75');
    expect(html).toContain('expenseCategory=Electricity+%26+water');
    expect(html).toContain('Total expenses');
    expect(html.indexOf('Total expenses')).toBeLessThan(html.indexOf('View Profit supporting records'));
    expect(html).not.toContain('View Food costs expense records');
    expect(html).toContain('View Expenses supporting records: GH₵2.00');
  });
  it('shows a zero-net category with recorded activity and does not invent missing details', async () => {
    const statement=await mocks.statement();
    const rent=statement.entries[0];
    mocks.statement.mockResolvedValue({...statement,otherExpenses:0,entries:[rent,{...rent,id:'reverse',amountPence:-200}]});
    expect(renderToStaticMarkup(await Page({}))).toContain('View Rent expense records: GH₵0.00');
    mocks.statement.mockResolvedValue({...statement,entries:[]});
    const html=renderToStaticMarkup(await Page({}));
    expect(html).toContain('Expense details could not be reconciled');
    expect(html).toContain('View Expenses supporting records: GH₵2.00');
  });
});
