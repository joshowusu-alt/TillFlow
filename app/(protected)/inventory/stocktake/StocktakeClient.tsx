'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, useMemo, useRef, useCallback } from 'react';
import { saveStocktakeCountsAction, completeStocktakeAction, cancelStocktakeAction } from '@/app/actions/stocktake';

export interface StocktakeLineDto {
  id: string;
  productId: string;
  productName: string;
  barcode: string | null;
  baseUnit: string;
  baseUnitPlural: string;
  expectedBase: number;
  countedBase: number | null;
}

interface Props {
  stocktakeId: string;
  lines: StocktakeLineDto[];
  startedBy: string;
  startedAt: string;
}

export default function StocktakeClient({ stocktakeId, lines: initialLines, startedBy, startedAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const l of initialLines) {
      m[l.id] = l.countedBase !== null ? String(l.countedBase) : '';
    }
    return m;
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'uncounted' | 'variance'>('all');
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const updateCount = useCallback((lineId: string, value: string) => {
    setCounts((prev) => ({ ...prev, [lineId]: value }));
  }, []);

  const filteredLines = useMemo(() => {
    let result = initialLines;

    // text filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.productName.toLowerCase().includes(q) ||
          (l.barcode && l.barcode.toLowerCase().includes(q))
      );
    }

    // status filter
    if (filter === 'uncounted') {
      result = result.filter((l) => !counts[l.id] || counts[l.id] === '');
    } else if (filter === 'variance') {
      result = result.filter((l) => {
        const c = counts[l.id];
        if (!c || c === '') return false;
        return Number(c) !== l.expectedBase;
      });
    }

    return result;
  }, [initialLines, search, filter, counts]);

  const stats = useMemo(() => {
    let counted = 0;
    let variances = 0;
    for (const l of initialLines) {
      const c = counts[l.id];
      if (c && c !== '') {
        counted++;
        if (Number(c) !== l.expectedBase) variances++;
      }
    }
    return { total: initialLines.length, counted, uncounted: initialLines.length - counted, variances };
  }, [initialLines, counts]);

  const handleSave = () => {
    setError('');
    const countsArray = initialLines
      .filter((l) => counts[l.id] && counts[l.id] !== '')
      .map((l) => ({
        lineId: l.id,
        countedBase: Number(counts[l.id]),
      }));

    startTransition(async () => {
      const result = await saveStocktakeCountsAction({ stocktakeId, counts: countsArray });
      if (result.success) {
        setSaveMsg(`Saved ${countsArray.length} counts`);
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setError(result.error);
      }
    });
  };

  const handleComplete = () => {
    setError('');
    startTransition(async () => {
      const countsArray = initialLines
        .filter((l) => counts[l.id] && counts[l.id] !== '')
        .map((l) => ({
          lineId: l.id,
          countedBase: Number(counts[l.id]),
        }));

      // Save first
      const saveResult = await saveStocktakeCountsAction({ stocktakeId, counts: countsArray });
      if (!saveResult.success) {
        setError(saveResult.error);
        return;
      }

      // Then complete
      const completeResult = await completeStocktakeAction({ stocktakeId, counts: countsArray });
      if (completeResult.success) {
        router.push('/inventory/stocktake');
        router.refresh();
      } else {
        setError(completeResult.error);
      }
    });
  };

  const handleCancel = () => {
    setError('');
    startTransition(async () => {
      const result = await cancelStocktakeAction(stocktakeId);
      if (result.success) {
        router.push('/inventory/stocktake');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium">
            {stats.counted}/{stats.total} counted
            {stats.variances > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">
                {stats.variances} variance{stats.variances > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span className="text-black/40">
            Started by {startedBy} — {new Date(startedAt).toLocaleString()}
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/5">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${stats.total > 0 ? (stats.counted / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Search & filters */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={searchRef}
          className="input flex-1 min-w-[200px]"
          placeholder="Search product or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {[
            { key: 'all' as const, label: `All (${stats.total})` },
            { key: 'uncounted' as const, label: `Uncounted (${stats.uncounted})` },
            { key: 'variance' as const, label: `Variances (${stats.variances})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === key ? 'bg-emerald-600 text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'
              }`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error / success messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}
      {saveMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{saveMsg}</div>
      )}

      {/* Count sheet */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/[0.02]">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50 uppercase w-1/3">Product</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50 uppercase hidden sm:table-cell">Barcode</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-black/50 uppercase">System Qty</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-black/50 uppercase">Counted</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-black/50 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredLines.map((line) => {
                const countedVal = counts[line.id];
                const hasCounted = countedVal !== '' && countedVal !== undefined;
                const counted = hasCounted ? Number(countedVal) : null;
                const variance = counted !== null ? counted - line.expectedBase : null;
                const unit = line.expectedBase === 1 ? line.baseUnit : line.baseUnitPlural;

                return (
                  <tr
                    key={line.id}
                    className={`${
                      variance !== null && variance !== 0
                        ? 'bg-amber-50/50'
                        : hasCounted
                        ? 'bg-emerald-50/30'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-sm font-medium">{line.productName}</td>
                    <td className="px-3 py-2 text-xs text-black/40 font-mono hidden sm:table-cell">
                      {line.barcode || '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">
                      {line.expectedBase} <span className="text-black/40 text-xs">{unit}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="input w-20 text-center text-sm tabular-nums mx-auto"
                        placeholder="—"
                        value={countedVal ?? ''}
                        onChange={(e) => updateCount(line.id, e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">
                      {variance !== null ? (
                        <span
                          className={`font-semibold ${
                            variance > 0
                              ? 'text-emerald-600'
                              : variance < 0
                              ? 'text-red-600'
                              : 'text-black/40'
                          }`}
                        >
                          {variance > 0 ? '+' : ''}
                          {variance}
                        </span>
                      ) : (
                        <span className="text-black/20">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-sm text-center text-black/40">
                    No products match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <button className="btn-primary text-sm" onClick={handleSave} disabled={pending}>
            {pending ? 'Saving…' : 'Save Progress'}
          </button>
          {stats.counted > 0 && (
            confirmComplete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-700">
                  Apply {stats.variances} variance{stats.variances !== 1 ? 's' : ''} to stock?
                </span>
                <button className="btn-primary text-sm bg-emerald-600" onClick={handleComplete} disabled={pending}>
                  Yes, Complete
                </button>
                <button className="btn-secondary text-sm" onClick={() => setConfirmComplete(false)}>
                  No
                </button>
              </div>
            ) : (
              <button
                className="btn-secondary text-sm border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setConfirmComplete(true)}
                disabled={pending}
              >
                Complete Stocktake
              </button>
            )
          )}
        </div>
        <div>
          {confirmCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-700">Cancel this stocktake?</span>
              <button className="text-sm font-medium text-red-600 hover:text-red-800" onClick={handleCancel} disabled={pending}>
                Yes, Cancel
              </button>
              <button className="btn-secondary text-sm" onClick={() => setConfirmCancel(false)}>
                No
              </button>
            </div>
          ) : (
            <button
              className="text-sm text-black/40 hover:text-red-600 transition-colors"
              onClick={() => setConfirmCancel(true)}
              disabled={pending}
            >
              Cancel Stocktake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
