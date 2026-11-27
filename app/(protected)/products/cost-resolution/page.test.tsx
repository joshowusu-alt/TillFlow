import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn(),guard:vi.fn(),statement:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireBusiness:mocks.auth}));
vi.mock('@/lib/services/cost-resolution-batch',()=>({loadCostResolutionBatch:mocks.load}));
vi.mock('@/lib/entitlements/live-report',()=>({guardLiveReport:mocks.guard}));
vi.mock('@/lib/reports/financials',()=>({getIncomeStatementBreakdown:mocks.statement}));
import Page from './page';
describe('cost resolution queue page',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();mocks.auth.mockResolvedValue({business:{id:'business',currency:'GHS',timezone:'Africa/Accra'}});
  mocks.guard.mockResolvedValue({ok:true,business:{id:'business',timezone:'Africa/Accra'},decision:{appliedRange:{fromLocalDate:'2026-11-01',toLocalDate:'2026-11-26'}}});
  mocks.statement.mockResolvedValue({cogs:100,grossProfit:200,netProfit:150});
  mocks.load.mockResolvedValue({total:607,next:'next',rows:[
   {id:'1',productId:'rice',storeId:'main',qtyOnHandBase:4,product:{name:'Rice'},store:{name:'Main'},preview:{status:'REVIEWABLE',stockValue:38400,cogsDelta:9600,corrections:[{}]}},
   {id:'2',productId:'other',storeId:'main',qtyOnHandBase:1,product:{name:'Other'},store:{name:'Main'},preview:{status:'BLOCKED',reason:'Mixed sources'}},
  ]});
 });
 it('renders candidate and blocked positions, links exact product and preserves cursor',async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({after:'cursor',review:'1'})}));
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER','MANAGER']);
  expect(mocks.load).toHaveBeenCalledWith('business','cursor',true);
  expect(html).toContain('Evidence candidate — not posted');
  expect(html).toContain('We can&#x27;t work this cost out automatically');
  expect(html).toContain('Stock value check — these products have no confirmed stock value yet. This doesn&#x27;t affect this month&#x27;s profit.');
  expect(html).not.toContain('Fixing this month');
  expect(html).toContain('1 affected sale line');
  expect(html).toContain('/products/rice/cost-review/preview?storeId=main');
  expect(html).toContain('/products/cost-resolution?after=next');
  expect(html).not.toContain('<form');
 });
 it('links only to the entitled month’s missing costs when profit is incomplete',async()=>{
  mocks.statement.mockResolvedValue({cogs:null,grossProfit:null,netProfit:null});
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
  expect(mocks.guard).toHaveBeenCalledWith(expect.objectContaining({surfaceId:'income_statement',action:'VIEW'}));
  expect(mocks.statement).toHaveBeenCalledWith('business',new Date('2026-11-01T00:00:00Z'),new Date('2026-11-27T00:00:00Z'));
  expect(html).toContain('Fixing this month&#x27;s profit? Go to Fix missing costs →');
  expect(html).toContain('/reports/income-statement/entries?metric=grossProfit&amp;from=2026-11-01&amp;to=2026-11-26&amp;issues=1');
 });
 it('does not read the report or expose a link when access is denied or belongs to another business',async()=>{
  for(const report of [{ok:false},{ok:true,business:{id:'foreign'},decision:{}}]){
   mocks.guard.mockResolvedValue(report);
   const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
   expect(html).not.toContain('Fixing this month');
  }
  expect(mocks.statement).not.toHaveBeenCalled();
 });
 it('never loads records without authorised business context',async()=>{
  mocks.auth.mockRejectedValue(new Error('DENIED'));
  await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('DENIED');
  expect(mocks.load).not.toHaveBeenCalled();
 });
});
