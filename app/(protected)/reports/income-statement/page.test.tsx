import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({open:vi.fn(),statement:vi.fn()}));
vi.mock('@/lib/entitlements/live-report',()=>({openLiveReport:mocks.open}));
vi.mock('@/lib/reports/financials',()=>({getIncomeStatementBreakdown:mocks.statement}));
vi.mock('@/components/DownloadLink',()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
vi.mock('@/components/reports/ReportsRefresh',()=>({default:()=>null}));
import Page from './page';
describe('income statement drilldown links',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.open.mockResolvedValue({ok:true,business:{id:'business',currency:'GHS',timezone:'Africa/Accra'},branch:{kind:'label',label:'Whole business'},decision:{appliedRange:{fromLocalDate:'2026-10-01',toLocalDate:'2026-10-20'}}});mocks.statement.mockResolvedValue({revenue:900,cogs:400,grossProfit:500,otherExpenses:200,otherOperatingIncome:50,netProfit:350,incompleteLineCount:0});});
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
    mocks.statement.mockResolvedValue({...await mocks.statement(),cogs:null,grossProfit:null,netProfit:null,incompleteLineCount:3,incompleteStockMessage:'607 products need confirmed stock value'});
    const html=renderToStaticMarkup(await Page({}));
    expect(html).toContain('metric=grossProfit&amp;from=2026-10-01&amp;to=2026-10-20&amp;issues=1');
    expect(html).toContain('3 sale lines require review');
    expect(html).toContain('/products?issue=MISSING_COST');
  });
  it('does not load the snapshot if access is denied',async()=>{
    mocks.open.mockResolvedValue({ok:false,denial:<p>Access denied</p>});expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');expect(mocks.statement).not.toHaveBeenCalled();
  });
});
