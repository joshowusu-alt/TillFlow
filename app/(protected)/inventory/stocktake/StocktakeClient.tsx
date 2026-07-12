'use client';

import { useRouter } from 'next/navigation';
import {
  useState,
  useTransition,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from 'react';
import { saveStocktakeCountsAction, completeStocktakeAction, cancelStocktakeAction } from '@/app/actions/stocktake';
import { usePosScannerBuffer } from '@/hooks/usePosScannerBuffer';

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

function unitLabel(line: StocktakeLineDto, qty: number) {
  return qty === 1 ? line.baseUnit : line.baseUnitPlural;
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
  const [varianceReason, setVarianceReason] = useState('');
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeIndexRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const map = new Map<string, string>();
    for (const line of initialLines) {
      const code = line.barcode?.trim();
      if (code) {
        map.set(code, line.id);
        map.set(code.toLowerCase(), line.id);
      }
    }
    barcodeIndexRef.current = map;
  }, [initialLines]);

  const updateCount = useCallback((lineId: string, value: string) => {
    setCounts((prev) => ({ ...prev, [lineId]: value }));
  }, []);

  const bumpCount = useCallback((lineId: string, delta: number) => {
    setCounts((prev) => {
      const current = prev[lineId];
      const n = current === '' || current === undefined ? 0 : Number(current);
      const next = Math.max(0, (Number.isFinite(n) ? n : 0) + delta);
      return { ...prev, [lineId]: String(next) };
    });
  }, []);

  const focusLineFromScan = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const lineId =
      barcodeIndexRef.current.get(trimmed) ??
      barcodeIndexRef.current.get(trimmed.toLowerCase()) ??
      null;
    if (!lineId) {
      setScanFlash(`No product found for ${trimmed}`);
      setSearch(trimmed);
      setTimeout(() => setScanFlash(null), 2500);
      return;
    }
    bumpCount(lineId, 1);
    setActiveLineId(lineId);
    setFilter('all');
    const line = initialLines.find((l) => l.id === lineId);
    setSearch(line?.productName ?? trimmed);
    setScanFlash(line ? `Counted +1: ${line.productName}` : 'Counted +1');
    setTimeout(() => setScanFlash(null), 2000);
  }, [bumpCount, initialLines]);

  usePosScannerBuffer({
    barcodeRef: searchRef,
    onScan: focusLineFromScan,
  });

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const value = search.trim();
    if (!value) return;
    // Prefer exact barcode match from the typed field (scanner into focused input)
    const byBarcode =
      barcodeIndexRef.current.get(value) ??
      barcodeIndexRef.current.get(value.toLowerCase());
    if (byBarcode) {
      event.preventDefault();
      bumpCount(byBarcode, 1);
      setActiveLineId(byBarcode);
      const line = initialLines.find((l) => l.id === byBarcode);
      setScanFlash(line ? `Counted +1: ${line.productName}` : 'Counted +1');
      setTimeout(() => setScanFlash(null), 2000);
    }
  };

  const filteredLines = useMemo(() => {
    let result = initialLines;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.productName.toLowerCase().includes(q) ||
          (l.barcode && l.barcode.toLowerCase().includes(q))
      );
    }

    if (filter === 'uncounted') {
      result = result.filter((l) => !counts[l.id] || counts[l.id] === '');
    } else if (filter === 'variance') {
      result = result.filter((l) => {
        const c = counts[l.id];
        if (!c || c === '') return false;
        return Number(c) !== l.expectedBase;
      });
    }

    if (activeLineId) {
      result = [...result].sort((a, b) => {
        if (a.id === activeLineId) return -1;
        if (b.id === activeLineId) return 1;
        return 0;
      });
    }

    return result;
  }, [initialLines, search, filter, counts, activeLineId]);

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

  const activeLine = activeLineId ? initialLines.find((l) => l.id === activeLineId) : null;

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
    if (stats.variances > 0 && varianceReason.trim().length < 3) {
      setError('Enter a reason for the variance adjustment before completing.');
      return;
    }

    startTransition(async () => {
      const countsArray = initialLines
        .filter((l) => counts[l.id] && counts[l.id] !== '')
        .map((l) => ({
          lineId: l.id,
          countedBase: Number(counts[l.id]),
        }));

      const saveResult = await saveStocktakeCountsAction({ stocktakeId, counts: countsArray });
      if (!saveResult.success) {
        setError(saveResult.error);
        return;
      }

      const completeResult = await completeStocktakeAction({
        stocktakeId,
        counts: countsArray,
        reason: varianceReason.trim(),
      });
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
      <div className="card p-4">
        <div className="mb-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">
            {stats.counted}/{stats.total} counted
            {stats.variances > 0 && (
              <span className="ml-2 font-semibold text-amber-600">
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

      <div className="space-y-2">
        <label className="label">Scan or search product</label>
        <input
          ref={searchRef}
          className="input min-h-12 text-base"
          placeholder="Scan barcode or type product name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoComplete="off"
          inputMode="search"
        />
        <p className="text-xs text-black/45">
          Hardware scanners work here. Exact barcode match adds +1. You can still search by name.
        </p>
        {scanFlash ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {scanFlash}
          </div>
        ) : null}
      </div>

      {activeLine ? (
        <div className="rounded-2xl border border-accent/25 bg-accentSoft/40 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Active product</div>
          <div className="mt-1 text-lg font-display font-semibold text-ink">{activeLine.productName}</div>
          <div className="mt-1 font-mono text-xs text-black/45">{activeLine.barcode || 'No barcode'}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-black/40">System</div>
              <div className="mt-1 text-base font-semibold">
                {activeLine.expectedBase}{' '}
                <span className="font-normal text-black/50">{unitLabel(activeLine, activeLine.expectedBase)}</span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-black/40">Counted</div>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary h-10 w-10 px-0 text-lg"
                  onClick={() => bumpCount(activeLine.id, -1)}
                  aria-label="Decrease count"
                >
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input h-10 flex-1 text-center text-lg tabular-nums"
                  value={counts[activeLine.id] ?? ''}
                  onChange={(e) => updateCount(activeLine.id, e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn-primary h-10 w-10 px-0 text-lg"
                  onClick={() => bumpCount(activeLine.id, 1)}
                  aria-label="Increase count"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          {counts[activeLine.id] !== '' && counts[activeLine.id] !== undefined ? (
            <div className="mt-3 text-sm">
              Variance:{' '}
              <span
                className={`font-semibold ${
                  Number(counts[activeLine.id]) - activeLine.expectedBase === 0
                    ? 'text-black/40'
                    : Number(counts[activeLine.id]) - activeLine.expectedBase > 0
                    ? 'text-emerald-600'
                    : 'text-red-600'
                }`}
              >
                {Number(counts[activeLine.id]) - activeLine.expectedBase > 0 ? '+' : ''}
                {Number(counts[activeLine.id]) - activeLine.expectedBase}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {[
          { key: 'all' as const, label: `All (${stats.total})` },
          { key: 'uncounted' as const, label: `Uncounted (${stats.uncounted})` },
          { key: 'variance' as const, label: `Variances (${stats.variances})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key ? 'bg-accent text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'
            }`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {saveMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{saveMsg}</div>
      )}

      <div className="space-y-3 lg:hidden">
        {filteredLines.map((line) => {
          const countedVal = counts[line.id];
          const hasCounted = countedVal !== '' && countedVal !== undefined;
          const counted = hasCounted ? Number(countedVal) : null;
          const variance = counted !== null ? counted - line.expectedBase : null;
          const unit = unitLabel(line, line.expectedBase);
          const isActive = line.id === activeLineId;

          return (
            <div
              key={line.id}
              className={`rounded-2xl border px-4 py-4 shadow-sm ${
                isActive
                  ? 'border-accent/40 ring-2 ring-accent/20'
                  : variance !== null && variance !== 0
                  ? 'border-amber-200 bg-amber-50/60'
                  : hasCounted
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : 'border-black/5 bg-white'
              }`}
              onClick={() => setActiveLineId(line.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">{line.productName}</div>
                  <div className="mt-1 font-mono text-xs text-black/40">{line.barcode || 'No barcode'}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">System</div>
                  <div className="mt-1 font-semibold text-ink">
                    {line.expectedBase} <span className="font-normal text-black/50">{unit}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="label">Counted</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary h-10 w-10 shrink-0 px-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpCount(line.id, -1);
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="input text-center text-sm tabular-nums"
                      placeholder="—"
                      value={countedVal ?? ''}
                      onChange={(e) => updateCount(line.id, e.target.value)}
                      onFocus={(e) => {
                        e.target.select();
                        setActiveLineId(line.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="btn-primary h-10 w-10 shrink-0 px-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpCount(line.id, 1);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <div className="label">Variance</div>
                  <div className="rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2 text-sm tabular-nums">
                    {variance !== null ? (
                      <span
                        className={`font-semibold ${
                          variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-red-600' : 'text-black/40'
                        }`}
                      >
                        {variance > 0 ? '+' : ''}
                        {variance}
                      </span>
                    ) : (
                      <span className="text-black/20">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredLines.length === 0 && (
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-center text-sm text-black/40">
            No products match your filter.
          </div>
        )}
      </div>

      <div className="card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/[0.02]">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-black/50 w-1/3">Product</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase text-black/50 sm:table-cell">Barcode</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-black/50">System Qty</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-black/50">Counted</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-black/50">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredLines.map((line) => {
                const countedVal = counts[line.id];
                const hasCounted = countedVal !== '' && countedVal !== undefined;
                const counted = hasCounted ? Number(countedVal) : null;
                const variance = counted !== null ? counted - line.expectedBase : null;
                const unit = unitLabel(line, line.expectedBase);

                return (
                  <tr
                    key={line.id}
                    className={`${
                      line.id === activeLineId
                        ? 'bg-accentSoft/50'
                        : variance !== null && variance !== 0
                        ? 'bg-amber-50/50'
                        : hasCounted
                        ? 'bg-emerald-50/30'
                        : ''
                    }`}
                    onClick={() => setActiveLineId(line.id)}
                  >
                    <td className="px-3 py-2 text-sm font-medium">{line.productName}</td>
                    <td className="hidden px-3 py-2 font-mono text-xs text-black/40 sm:table-cell">
                      {line.barcode || '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {line.expectedBase} <span className="text-xs text-black/40">{unit}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="btn-secondary h-8 w-8 px-0 text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            bumpCount(line.id, -1);
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="input mx-auto w-20 text-center text-sm tabular-nums"
                          value={countedVal ?? ''}
                          onChange={(e) => updateCount(line.id, e.target.value)}
                          onFocus={(e) => {
                            e.target.select();
                            setActiveLineId(line.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          type="button"
                          className="btn-primary h-8 w-8 px-0 text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            bumpCount(line.id, 1);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {variance !== null ? (
                        <span
                          className={`font-semibold ${
                            variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-red-600' : 'text-black/40'
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
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-black/40">
                    No products match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" className="btn-primary w-full text-sm sm:w-auto" onClick={handleSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save Progress'}
            </button>
            {stats.counted > 0 && (
              confirmComplete ? (
                <div className="w-full space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:max-w-xl">
                  <p className="text-sm text-amber-900">
                    You are about to adjust <span className="font-semibold">{stats.variances}</span> product
                    {stats.variances === 1 ? '' : 's'} based on this stocktake.
                    {stats.variances > 0
                      ? ' Please enter a reason for the variance adjustment.'
                      : ' No quantity changes will be posted.'}
                  </p>
                  {stats.variances > 0 ? (
                    <div>
                      <label className="label">Variance reason</label>
                      <input
                        className="input"
                        value={varianceReason}
                        onChange={(e) => setVarianceReason(e.target.value)}
                        placeholder="Example: Monthly stock count, damaged goods found, shelf count correction."
                        maxLength={500}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" className="btn-primary text-sm" onClick={handleComplete} disabled={pending}>
                      Yes, Complete
                    </button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => setConfirmComplete(false)}>
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-secondary w-full text-sm sm:w-auto"
                  onClick={() => setConfirmComplete(true)}
                  disabled={pending}
                >
                  Complete Stocktake
                </button>
              )
            )}
          </div>
          {confirmCancel ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-sm text-red-700">Cancel this stocktake?</span>
              <button type="button" className="btn-secondary text-sm text-red-700" onClick={handleCancel} disabled={pending}>
                Yes, cancel
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setConfirmCancel(false)}>
                Keep counting
              </button>
            </div>
          ) : (
            <button type="button" className="btn-ghost text-sm text-red-600" onClick={() => setConfirmCancel(true)} disabled={pending}>
              Cancel stocktake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
