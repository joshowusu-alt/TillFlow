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
});
