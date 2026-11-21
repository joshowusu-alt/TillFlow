import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const m=vi.hoisted(()=>({auth:vi.fn(),preview:vi.fn(),history:vi.fn(),plan:vi.fn(),submit:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireBusiness:m.auth}));
vi.mock('@/lib/services/historical-cost-preview-load',()=>({loadHistoricalCostPreview:m.preview}));
vi.mock('@/lib/services/historical-cost-correction',()=>({listHistoricalCostCorrections:m.history}));
vi.mock('@/lib/services/historical-cost-posting-plan',()=>({buildHistoricalCostPostingPlan:m.plan}));
vi.mock('@/app/actions/historical-cost-correction',()=>({submitHistoricalCostCorrection:m.submit}));
import Page from './page';
const props={params:Promise.resolve({id:'product'}),searchParams:Promise.resolve({storeId:'store'})};
const fp='a'.repeat(64);
describe('owner confirmation and reversal interface',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.auth.mockResolvedValue({business:{id:'business',currency:'GHS',timezone:'Africa/Accra'},user:{role:'OWNER'}});
  m.preview.mockResolvedValue({product:'Rice',store:'Main',result:{status:'REVIEWABLE',source:{id:'purchase',label:'PUR-1',qty:5,value:5000},unitCost:1000,stockValue:4000,cogsDelta:1000,corrections:[]}});
  m.plan.mockReturnValue({fingerprint:fp});m.history.mockResolvedValue([]);
 });
 it('requires exact owner confirmation and never submits from rendering',async()=>{
  const html=renderToStaticMarkup(await Page(props));
  expect(html).toContain('POST COST');
  expect(html).toContain('name="fingerprint"');expect(html).toContain(fp);
  expect(html).toContain('Post confirmed correction');
  expect(m.submit).not.toHaveBeenCalled();
 });
 it('manager can review evidence but cannot see posting or reversal controls',async()=>{
  m.auth.mockResolvedValue({business:{id:'business',currency:'GHS',timezone:'Africa/Accra'},user:{role:'MANAGER'}});
  const html=renderToStaticMarkup(await Page(props));
  expect(html).toContain('Only an owner');
  expect(html).not.toContain('Post confirmed correction');expect(html).not.toContain('Reverse correction');
  expect(m.history).not.toHaveBeenCalled();
 });
 it('shows actual posted correction history even when preview is blocked',async()=>{
  m.preview.mockResolvedValue({product:'Rice',store:'Main',result:{status:'BLOCKED',reason:'Already confirmed'}});
  m.history.mockResolvedValue([{fingerprint:fp,cogsDelta:1000,remainingStockValue:4000,createdAt:new Date('2026-11-21'),reason:'Verified',userName:'Owner',reversed:false}]);
  const html=renderToStaticMarkup(await Page(props));
  expect(html).toContain('Posted correction history');expect(html).toContain('REVERSE COST');expect(html).not.toContain('Post confirmed correction');
  expect(m.history).toHaveBeenCalledWith({businessId:'business',productId:'product',storeId:'store'});
 });
});
