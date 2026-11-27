import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({preview:vi.fn(),plan:vi.fn(),submit:vi.fn()}));
vi.mock('@/lib/services/historical-cost-preview-load',()=>({loadHistoricalCostPreview:mocks.preview}));
vi.mock('@/lib/services/historical-cost-posting-plan',()=>({buildHistoricalCostPostingPlan:mocks.plan}));
vi.mock('@/app/actions/historical-cost-correction',()=>({submitHistoricalCostCorrection:mocks.submit}));
import OneScreenCostFix from './OneScreenCostFix';
import type { CostReviewGroup } from '@/lib/reports/cost-review-navigation';
const date=new Date('2026-11-16T12:00:00Z');
const group={productId:'rice',items:[{receipt:{id:'sale:invoice'}}]} as CostReviewGroup;
const props={group,businessId:'business',stores:[{id:'main',name:'Main'}],currency:'GHS',timezone:'Africa/Accra',from:'2026-11-01',to:'2026-11-26',metric:'grossProfit'};
const result={status:'REVIEWABLE',source:{id:'purchase',label:'PUR-000010',qty:5,date,value:64000},unitCost:12800,stockValue:38400,cogsDelta:25600,corrections:[{invoiceId:'invoice',date}]};
describe('single screen cost fix',()=>{
  it('shows the original purchase and explicit confirmation without today’s product cost',async()=>{
    mocks.preview.mockResolvedValue({result});mocks.plan.mockReturnValue({fingerprint:'a'.repeat(64)});
    const html=renderToStaticMarkup(await OneScreenCostFix(props));
    expect(html).toContain('Use GH₵128.00 per stock unit from PUR-000010');
    expect(html).toContain('Use this cost');expect(html).toContain('name="reason"');expect(html).toContain('name="confirmed"');
    expect(html).not.toContain('name="unitCost"');expect(html).not.toContain('POST COST');
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('shows a blank cost input only for proven unvalued opening stock',async()=>{
    mocks.preview.mockResolvedValueOnce({result:{status:'BLOCKED'}}).mockResolvedValueOnce({result:{...result,source:{...result.source,opening:{needsValue:true}},unitCost:1}});
    const html=renderToStaticMarkup(await OneScreenCostFix(props));
    expect(html).toContain('No purchase record found');expect(html).toContain('name="unitCost"');
    expect(html).toContain('This also records the value of your opening stock.');
    expect(html).toContain('See accounting details');expect(html).not.toContain('Use GH₵0.01');
  });
});
