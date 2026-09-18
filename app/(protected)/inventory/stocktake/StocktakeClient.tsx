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
import type { StocktakeLineState } from '@/lib/reliability/walkthrough-contracts';
import {
  evaluateSubmittedStocktakeCount,
  stocktakeCountStateLabel,
} from './stocktake-state';

export interface StocktakeLineDto {
  id: string;
  productId: string;
  productName: string;
  barcode: string | null;
  baseUnit: string;
  baseUnitPlural: string;
  expectedBase: number;
  countedBase: number | null;
  countState: StocktakeLineState;
  avgCostBasePence: number;
}

interface Props {
  stocktakeId: string;
  transactionNumber: string;
  lines: StocktakeLineDto[];
  startedBy: string;
  startedAt: string;
  currency: string;
  isStale: boolean;
  actorRole: string;
}

function unitLabel(line: StocktakeLineDto, qty: number) {
  return qty === 1 ? line.baseUnit : line.baseUnitPlural;
}

function formatPence(pence: number, currency: string) {
  return `${currency} ${(pence / 100).toFixed(2)}`;
}

function CountStateBadge({ state }: { state: StocktakeLineState }) {
  const styles: Record<StocktakeLineState, string> = {
    UNCOUNTED: 'bg-slate-100 text-slate-700',
    COUNTED: 'bg-emerald-50 text-emerald-700',
    VARIANCE_REVIEWED: 'bg-amber-50 text-amber-800',
    APPROVED: 'bg-sky-50 text-sky-800',
    POSTED: 'bg-purple-50 text-purple-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[state]}`}>
      {stocktakeCountStateLabel(state)}
    </span>
  );
}

export default function StocktakeClient({
  stocktakeId,
  transactionNumber,
  lines: initialLines,
  startedBy,
  startedAt,
  currency,
  isStale,
  actorRole,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const l of initialLines) {
      m[l.id] = l.countState === 'UNCOUNTED' || l.countedBase === null ? '' : String(l.countedBase);
    }
    return m;
  });
  const [confirmedZero, setConfirmedZero] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const l of initialLines) {
      m[l.id] = l.countState !== 'UNCOUNTED' && l.countedBase === 0;
    }
    return m;
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'uncounted' | 'variance'>('all');
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [allowPartial, setAllowPartial] = useState(false);
  const [partialReason, setPartialReason] = useState('');
  const [staleAction, setStaleAction] = useState<'warn' | 'resume' | 'review'>(isStale ? 'warn' : 'resume');
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeIndexRef = useRef<Map<string, string>>(new Map());
  const canCancel = actorRole === 'MANAGER' || actorRole === 'OWNER';

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
    if (value !== '0') {
      setConfirmedZero((prev) => ({ ...prev, [lineId]: false }));
    }
  }, []);

  const bumpCount = useCallback((lineId: string, delta: number) => {
    setCounts((prev) => {
      const current = prev[lineId];
      if ((current === '' || current === undefined) && delta < 0) {
        return prev;
      }
      const n = current === '' || current === undefined ? 0 : Number(current);
      const next = Math.max(0, (Number.isFinite(n) ? n : 0) + delta);
      return { ...prev, [lineId]: String(next) };
    });
    setConfirmedZero((prev) => ({ ...prev, [lineId]: false }));
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

  const lineSubmission = useCallback((lineId: string) => {
    return evaluateSubmittedStocktakeCount({
      rawValue: counts[lineId],
      confirmedZero: confirmedZero[lineId],
    });
  }, [counts, confirmedZero]);

  const submittedCounts = useMemo(
    () =>
      initialLines
        .map((l) => {
          const evaluated = lineSubmission(l.id);
          if (!evaluated.submitted || evaluated.countedBase === null) return null;
          return {
            lineId: l.id,
            countedBase: evaluated.countedBase,
            confirmedZero: evaluated.countedBase === 0,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    [initialLines, lineSubmission],
  );
  const clearedLineIds = useMemo(
    () => initialLines.filter((l) => !lineSubmission(l.id).submitted).map((l) => l.id),
    [initialLines, lineSubmission],
  );

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
      result = result.filter((l) => !lineSubmission(l.id).submitted);
    } else if (filter === 'variance') {
      result = result.filter((l) => {
        const evaluated = lineSubmission(l.id);
        if (!evaluated.submitted || evaluated.countedBase === null) return false;
        return evaluated.countedBase !== l.expectedBase;
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
  }, [initialLines, search, filter, lineSubmission, activeLineId]);

  const stats = useMemo(() => {
    let counted = 0;
    let variances = 0;
    let shortfalls = 0;
    let surpluses = 0;
    let qtyImpact = 0;
    let valueImpact = 0;
    for (const l of initialLines) {
      const evaluated = lineSubmission(l.id);
      if (evaluated.submitted && evaluated.countedBase !== null) {
        counted++;
        const variance = evaluated.countedBase - l.expectedBase;
        qtyImpact += variance;
        valueImpact += variance * (l.avgCostBasePence || 0);
        if (variance !== 0) {
          variances++;
          if (variance < 0) shortfalls++;
          if (variance > 0) surpluses++;
        }
      }
    }
    return {
      total: initialLines.length,
      counted,
      uncounted: initialLines.length - counted,
      variances,
      shortfalls,
      surpluses,
      qtyImpact,
      valueImpact,
    };
  }, [initialLines, lineSubmission]);

  const activeLine = activeLineId ? initialLines.find((l) => l.id === activeLineId) : null;
  const activeEvaluated = activeLine ? lineSubmission(activeLine.id) : null;

  const handleSave = () => {
    setError('');
    startTransition(async () => {
      const result = await saveStocktakeCountsAction({ stocktakeId, counts: submittedCounts, clearedLineIds });
      if (result.success) {
        setSaveMsg(`Saved ${submittedCounts.length} counts`);
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setError(result.error);
      }
    });
  };

  const handleComplete = () => {
    setError('');
    if (stats.uncounted > 0 && !allowPartial) {
      setError('Count every product, or tick authorised partial count and enter a reason. Uncounted lines are not treated as zero.');
      return;
    }
    if (stats.uncounted > 0 && partialReason.trim().length < 3) {
      setError('Enter a reason for the authorised partial count.');
      return;
    }
    if (stats.variances > 0 && varianceReason.trim().length < 3) {
      setError('Enter a reason for the variance adjustment before completing.');
      return;
    }

    startTransition(async () => {
      const saveResult = await saveStocktakeCountsAction({ stocktakeId, counts: submittedCounts, clearedLineIds });
      if (!saveResult.success) {
        setError(saveResult.error);
        return;
      }

      const completeResult = await completeStocktakeAction({
        stocktakeId,
        counts: submittedCounts,
        reason: varianceReason.trim(),
        allowPartial: stats.uncounted > 0 && allowPartial,
        partialReason: partialReason.trim(),
      });
      if (completeResult.success) {
        const surplus = completeResult.data?.surplusPendingReview ?? 0;
        if (surplus > 0) {
          setSaveMsg(
            `Stocktake completed. ${surplus} surplus line(s) saved as pending review — authoritative on-hand balance was not increased.`,
          );
        }
        router.push('/inventory/stocktake');
        router.refresh();
      } else {
        setError(completeResult.error);
      }
    });
  };

  const handleCancel = () => {
    setError('');
    if (cancelReason.trim().length < 3) {
      setError('Enter a reason before cancelling this stocktake.');
      return;
    }
    startTransition(async () => {
      const result = await cancelStocktakeAction({ stocktakeId, reason: cancelReason.trim() });
      if (result.success) {
        router.push('/inventory/stocktake');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const countingLocked = isStale && staleAction === 'warn';
  const reviewOnly = staleAction === 'review';

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">
            {transactionNumber} · {stats.counted}/{stats.total} counted
            {stats.variances > 0 && (
              <span className="ml-2 font-semibold text-amber-600">
                {stats.variances} variance{stats.variances > 1 ? 's' : ''}
                {stats.surpluses > 0
                  ? ` (${stats.surpluses} surplus pending review — balance unchanged)`
                  : ''}
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

      {isStale ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">This stocktake is older than 7 days</div>
          <p className="mt-1 text-amber-900/80">
            It will not be posted or deleted automatically. Resume counting, review the current
            counts, or cancel with a reason.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" onClick={() => setStaleAction('resume')}>
              Resume
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setStaleAction('review')}>
              Review
            </button>
            {canCancel ? (
              <button type="button" className="btn-ghost text-sm text-red-700" onClick={() => setConfirmCancel(true)}>
                Cancel with reason
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {countingLocked ? (
        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/65">
          Choose Resume to keep counting, Review to inspect counts, or Cancel with a reason.
        </div>
      ) : null}

      {!countingLocked ? (
        <>
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
          disabled={reviewOnly}
        />
        <p className="text-xs text-black/45">
          Hardware scanners work here. Exact barcode match adds +1. You can still search by name.
          An empty count stays uncounted — it is not a physical zero.
        </p>
        {scanFlash ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {scanFlash}
          </div>
        ) : null}
      </div>

      {activeLine && !reviewOnly ? (
        <div className="rounded-2xl border border-accent/25 bg-accentSoft/40 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Active product</div>
            <CountStateBadge state={activeEvaluated?.submitted ? 'COUNTED' : 'UNCOUNTED'} />
          </div>
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
                  placeholder="—"
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
          {counts[activeLine.id] === '0' ? (
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(confirmedZero[activeLine.id])}
                onChange={(e) =>
                  setConfirmedZero((prev) => ({ ...prev, [activeLine.id]: e.target.checked }))
                }
              />
              <span>Confirm this product was physically counted as zero. An empty box stays uncounted.</span>
            </label>
          ) : null}
          {activeEvaluated?.submitted && activeEvaluated.countedBase !== null ? (
            <div className="mt-3 text-sm">
              Variance:{' '}
              <span
                className={`font-semibold ${
                  activeEvaluated.countedBase - activeLine.expectedBase === 0
                    ? 'text-black/40'
                    : activeEvaluated.countedBase - activeLine.expectedBase > 0
                    ? 'text-emerald-600'
                    : 'text-red-600'
                }`}
              >
                {activeEvaluated.countedBase - activeLine.expectedBase > 0 ? '+' : ''}
                {activeEvaluated.countedBase - activeLine.expectedBase}
              </span>
            </div>
          ) : (
            <div className="mt-3 text-sm text-black/45">Uncounted — not treated as zero.</div>
          )}
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
          const evaluated = lineSubmission(line.id);
          const hasCounted = evaluated.submitted && evaluated.countedBase !== null;
          const counted = hasCounted ? evaluated.countedBase : null;
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
                  <CountStateBadge state={hasCounted ? 'COUNTED' : 'UNCOUNTED'} />
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-black/40">System</div>
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
                      disabled={reviewOnly}
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
                      disabled={reviewOnly}
                      value={counts[line.id] ?? ''}
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
                      disabled={reviewOnly}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpCount(line.id, 1);
                      }}
                    >
                      +
                    </button>
                  </div>
                  {counts[line.id] === '0' && !reviewOnly ? (
                    <label className="mt-2 flex items-start gap-2 text-xs text-ink">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(confirmedZero[line.id])}
                        onChange={(e) =>
                          setConfirmedZero((prev) => ({ ...prev, [line.id]: e.target.checked }))
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>Confirm physical zero</span>
                    </label>
                  ) : null}
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
                      <span className="text-black/20">Uncounted</span>
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
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-black/50">State</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-black/50">System Qty</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-black/50">Counted</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-black/50">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredLines.map((line) => {
                const evaluated = lineSubmission(line.id);
                const hasCounted = evaluated.submitted && evaluated.countedBase !== null;
                const counted = hasCounted ? evaluated.countedBase : null;
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
                    <td className="px-3 py-2">
                      <CountStateBadge state={hasCounted ? 'COUNTED' : 'UNCOUNTED'} />
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {line.expectedBase} <span className="text-xs text-black/40">{unit}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="btn-secondary h-8 w-8 px-0 text-sm"
                            disabled={reviewOnly}
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
                            placeholder="—"
                            disabled={reviewOnly}
                            value={counts[line.id] ?? ''}
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
                            disabled={reviewOnly}
                            onClick={(e) => {
                              e.stopPropagation();
                              bumpCount(line.id, 1);
                            }}
                          >
                            +
                          </button>
                        </div>
                        {counts[line.id] === '0' && !reviewOnly ? (
                          <label className="flex items-center gap-1 text-[11px] text-black/65">
                            <input
                              type="checkbox"
                              checked={Boolean(confirmedZero[line.id])}
                              onChange={(e) =>
                                setConfirmedZero((prev) => ({ ...prev, [line.id]: e.target.checked }))
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                            Confirm zero
                          </label>
                        ) : null}
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
                        <span className="text-black/20">Uncounted</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-black/40">
                    No products match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <div className="rounded-xl border border-black/5 bg-white px-3 py-3 text-sm">
          <div className="font-semibold text-ink">Quantity and value impact</div>
          <div className="mt-1 text-black/65">
            Counted lines only. Uncounted products are excluded and are not treated as zero.
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>Qty impact: <span className="font-semibold tabular-nums">{stats.qtyImpact > 0 ? '+' : ''}{stats.qtyImpact}</span></div>
            <div>Value impact: <span className="font-semibold tabular-nums">{formatPence(stats.valueImpact, currency)}</span></div>
            <div>Uncounted: <span className="font-semibold">{stats.uncounted}</span></div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!reviewOnly ? (
            <button type="button" className="btn-primary w-full text-sm sm:w-auto" onClick={handleSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save Progress'}
            </button>
            ) : null}
            {stats.counted > 0 && !reviewOnly && (
              confirmComplete ? (
                <div className="w-full space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:max-w-xl">
                  <p className="text-sm text-amber-900">
                    Shortfalls ({stats.shortfalls}) will reduce on-hand stock via Phase 1 inventory
                    decrease. Surpluses ({stats.surpluses}) are saved as pending review and will{' '}
                    <span className="font-semibold">not</span> change the authoritative balance yet.
                    Quantity impact {stats.qtyImpact > 0 ? '+' : ''}{stats.qtyImpact}; value impact{' '}
                    {formatPence(stats.valueImpact, currency)}.
                    {stats.variances > 0
                      ? ' Please enter a reason before completing.'
                      : ' No quantity changes will be posted.'}
                  </p>
                  {stats.uncounted > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-white/70 p-2">
                      <label className="flex items-start gap-2 text-sm text-amber-950">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={allowPartial}
                          onChange={(e) => setAllowPartial(e.target.checked)}
                        />
                        <span>
                          Authorised partial count — leave {stats.uncounted} uncounted line(s)
                          uncounted. They will not be posted as zero.
                        </span>
                      </label>
                      {allowPartial ? (
                        <input
                          className="input"
                          value={partialReason}
                          onChange={(e) => setPartialReason(e.target.value)}
                          placeholder="Reason for completing with uncounted lines"
                          maxLength={500}
                        />
                      ) : (
                        <p className="text-xs text-amber-800">
                          Count remaining products, or authorise a partial count with a reason.
                        </p>
                      )}
                    </div>
                  ) : null}
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
          {confirmCancel && canCancel ? (
            <div className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50/70 p-3 sm:max-w-xl">
              <span className="text-sm text-red-700">Cancel this stocktake? This is never silent — a reason is required.</span>
              <input
                className="input"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancelling"
                maxLength={500}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button type="button" className="btn-secondary text-sm text-red-700" onClick={handleCancel} disabled={pending}>
                  Yes, cancel
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setConfirmCancel(false)}>
                  Keep counting
                </button>
              </div>
            </div>
          ) : canCancel ? (
            <button type="button" className="btn-ghost text-sm text-red-600" onClick={() => setConfirmCancel(true)} disabled={pending}>
              Cancel stocktake
            </button>
          ) : null}
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
