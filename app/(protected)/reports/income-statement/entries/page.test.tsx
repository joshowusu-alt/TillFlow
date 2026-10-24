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
    expect(html).toContain('Gross Profit — supporting records');expect(html).toContain('href="/sales/one"');
    expect(html).toContain('/reports/income-statement?from=2026-10-01&amp;to=2026-10-20');
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
});
