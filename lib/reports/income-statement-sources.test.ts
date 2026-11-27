import { describe, expect, it, vi } from 'vitest';
import { loadIncomeStatementSources } from './income-statement-sources';

describe('read-only income statement source metadata', () => {
  it('does not infer a category from free text or claim an unlinked journal is a cash receipt', async () => {
    const expense = vi.fn().mockResolvedValue([]);
    const adjustment = vi.fn().mockResolvedValue([]);
    const db = { expense: { findMany: expense }, stockAdjustment: { findMany: adjustment } };
    const sources = await loadIncomeStatementSources(db as never, 'business', [
      { id: 'missing', referenceType: 'EXPENSE', referenceId: 'foreign' },
      { id: 'manual', referenceType: null, referenceId: null },
    ]);
    expect(sources.get('missing')).toEqual({ title: 'Posted accounting entry', reference: 'missing', details: ['Linked source details unavailable here.'] });
    expect(sources.get('manual')?.details).toEqual(['No source document linked.']);
    expect(adjustment).not.toHaveBeenCalled();
    expect(expense).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business', store: { businessId: 'business' }, id: { in: ['foreign'] } } }));
  });

  it('deduplicates source references and bounds each query without dropping journal lines', async () => {
    const expense = vi.fn().mockResolvedValue([]);
    const db = { expense: { findMany: expense }, stockAdjustment: { findMany: vi.fn() } };
    const journals = Array.from({ length: 805 }, (_, i) => ({ id: 'j' + i, referenceType: 'EXPENSE', referenceId: 'e' + i }));
    const result = await loadIncomeStatementSources(db as never, 'business', [...journals, { ...journals[0], id: 'duplicate' }]);
    expect(expense.mock.calls.map(([query]) => query.where.id.in.length)).toEqual([400, 400, 5]);
    expect(result.size).toBe(806);
  });
  it('uses the payee for an expense without notes and shows a recorded reason once',async()=>{
    const expense=vi.fn().mockResolvedValue([{id:'e',notes:null,vendorName:'Lunch',transactionNumber:'EXP-1',reference:null,store:{name:'Main'}}]);
    const adjustment=vi.fn().mockResolvedValue([{id:'a',reason:'Damaged',reasonCode:'DAMAGED',transactionNumber:'ADJ-1',reversalOfId:null,store:{name:'Main'},product:{name:'Rice'}}]);
    const result=await loadIncomeStatementSources({expense:{findMany:expense},stockAdjustment:{findMany:adjustment}} as never,'business',[{id:'j1',referenceType:'EXPENSE',referenceId:'e'},{id:'j2',referenceType:'STOCK_ADJUSTMENT',referenceId:'a'}]);
    expect(result.get('j1')?.title).toBe('Lunch');
    expect(result.get('j2')?.title).toBe('Damaged — Rice');
    expect(result.get('j2')?.details).toEqual(['Branch: Main']);
  });
  it('titles stock cards with the recorded reason and product, preserving distinct notes and reversals',async()=>{
    const cases=[
      {reasonCode:'STOCKTAKE_SHORTFALL',reason:'Count shortage',title:'Count shortage — OATS',details:[]},
      {reasonCode:'STOCK_FOUND',reason:'Stock found',title:'Found in count — OATS',details:[]},
      {reasonCode:'PHYSICAL_COUNT_SURPLUS',reason:'Physical count surplus',title:'Found in count — OATS',details:[]},
      {reasonCode:'THEFT',reason:'Recorded theft reason',title:'Theft — OATS',details:[]},
      {reasonCode:'EXPIRED',reason:'Expired yesterday',title:'Expired — OATS',details:['Expired yesterday']},
      {reasonCode:null,reason:'Damaged',title:'Damaged — OATS',details:[]},
      {reasonCode:null,reason:'  ',title:'Quantity correction — OATS',details:[]},
      {reasonCode:'DAMAGED',reason:'Damaged',reversalOfId:'prior',title:'Damaged — OATS — reversal',details:[]},
    ];
    const rows=cases.map(({reasonCode,reason,reversalOfId},i)=>({id:String(i),reasonCode,reason,reversalOfId,product:{name:'OATS'},store:{name:'Main'},transactionNumber:'ADJ-'+i}));
    const sources=await loadIncomeStatementSources({expense:{findMany:vi.fn()},stockAdjustment:{findMany:vi.fn().mockResolvedValue(rows)}} as never,'business',rows.map(row=>({id:'j'+row.id,referenceType:'STOCK_ADJUSTMENT',referenceId:row.id})));
    cases.forEach((test,i)=>expect(sources.get('j'+i)).toMatchObject({title:test.title,details:['Branch: Main',...test.details],nonCash:true}));
  });
});
