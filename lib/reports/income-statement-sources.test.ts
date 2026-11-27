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
    expect(result.get('j2')?.title).toBe('Damaged');
    expect(result.get('j2')?.details).toEqual(['Product: Rice','Branch: Main']);
  });
});
