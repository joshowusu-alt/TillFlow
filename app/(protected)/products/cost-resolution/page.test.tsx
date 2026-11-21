import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireBusiness:mocks.auth}));
vi.mock('@/lib/services/cost-resolution-batch',()=>({loadCostResolutionBatch:mocks.load}));
import Page from './page';
describe('cost resolution queue page',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();mocks.auth.mockResolvedValue({business:{id:'business',currency:'GHS',timezone:'Africa/Accra'}});
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
  expect(html).toContain('Manual reconciliation required');
  expect(html).toContain('/products/rice/cost-review/preview?storeId=main');
  expect(html).toContain('/products/cost-resolution?after=next');
  expect(html).not.toContain('<form');
 });
 it('never loads records without authorised business context',async()=>{
  mocks.auth.mockRejectedValue(new Error('DENIED'));
  await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('DENIED');
  expect(mocks.load).not.toHaveBeenCalled();
 });
});
