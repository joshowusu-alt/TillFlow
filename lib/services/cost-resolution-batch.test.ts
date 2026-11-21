import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({inventoryBalance:{count:vi.fn(),findMany:vi.fn()},preview:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:db}));
vi.mock('./historical-cost-preview-load',()=>({loadHistoricalCostPreview:db.preview}));
import {loadCostResolutionBatch,COST_RESOLUTION_BATCH_SIZE} from './cost-resolution-batch';
describe('bounded cost resolution queue',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    db.inventoryBalance.count.mockResolvedValue(607);
    db.inventoryBalance.findMany.mockResolvedValue(Array.from({length:COST_RESOLUTION_BATCH_SIZE+1},(_,i)=>({id:String(i),productId:'p'+i,storeId:'s',qtyOnHandBase:4,product:{name:'Rice'},store:{name:'Main'}})));
    db.preview.mockResolvedValue({result:{status:'REVIEWABLE',stockValue:38400,cogsDelta:9600,corrections:[{lineId:'line'}]}});
  });
  it('pages scoped stock records and does not load detailed evidence until asked',async()=>{
    const result=await loadCostResolutionBatch('business','cursor',false);
    expect(result.total).toBe(607);
    expect(result.rows).toHaveLength(COST_RESOLUTION_BATCH_SIZE);
    expect(result.next).toBe('4');
    expect(db.preview).not.toHaveBeenCalled();
    expect(db.inventoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({store:{businessId:'business'},product:{businessId:'business',foodDish:{is:null}},id:{gt:'cursor'},qtyOnHandBase:{gt:0}}),take:6}));
  });
  it('independently proves only the current batch and flags a failed preview without inventing costs',async()=>{
    db.preview.mockRejectedValueOnce(new Error('timeout'));
    const result=await loadCostResolutionBatch('business',undefined,true);
    expect(db.preview).toHaveBeenCalledTimes(COST_RESOLUTION_BATCH_SIZE);
    expect(db.preview).toHaveBeenCalledWith('business','p0','s');
    expect(result.rows[0].preview).toMatchObject({status:'BLOCKED'});
    expect(result.rows[1].preview).toMatchObject({status:'REVIEWABLE',stockValue:38400});
  });
});
