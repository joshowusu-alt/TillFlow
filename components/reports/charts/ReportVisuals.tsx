'use client';

import { useEffect, useId, useRef, useState } from 'react';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { formatMoney } from '@/lib/format';

const colours = ['#2454d9', '#08916c', '#a450c6', '#c47b0a', '#087e99', '#b44466'];
export function buildMix(rows: { name: string; value: number }[]) {
  if (rows.some(row => !Number.isFinite(row.value) || row.value < 0)) return null;
  const sorted = rows.filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  return sorted.length <= 6 ? sorted : [...sorted.slice(0, 5), { name: 'Other', value: sorted.slice(5).reduce((sum, row) => sum + row.value, 0) }];
}

export function SalesMixChart({ title, rows, currency, compact = false }: { title: string; compact?: boolean; rows: { name: string; value: number }[]; currency: string }) {
  const slices = buildMix(rows);
  const total = slices?.reduce((sum, row) => sum + row.value, 0) ?? 0;
  if (!slices) return <p className="text-sm text-slate-600">{title}: a share chart is unavailable because this selection includes negative values. Use the signed figures in the table.</p>;
  if (!total) return <p className="text-sm text-slate-600">{title}: no sales in this selection.</p>;
  let offset = 0;
  return <figure className={compact ? "min-w-0" : "min-w-0 rounded-xl bg-slate-50 p-4"}>
    <figcaption className="mb-3 font-semibold">{title}</figcaption>
    <div className={compact ? "grid min-w-0 items-center gap-4" : "grid min-w-0 items-center gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]"}>
      <svg viewBox="0 0 120 120" className="mx-auto w-44 max-w-full" role="img" aria-label={`${title}. Shares and exact amounts are listed alongside.`}>
        {slices.map((row, i) => { const share = row.value / total * 100; const start = offset; offset += share; return <circle key={i} cx="60" cy="60" r="43" fill="none" stroke={colours[i]} strokeWidth="19" pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 60 60)"><title>{`${row.name}: ${formatMoney(row.value, currency)} (${share.toFixed(1)}%)`}</title></circle>; })}
        <text x="60" y="58" textAnchor="middle" fontSize="10" fill="#475569">Sales mix</text><text x="60" y="72" textAnchor="middle" fontSize="13" fontWeight="700" fill="#172033">100%</text>
      </svg>
      <ul className="min-w-0 space-y-3 text-sm">{slices.map((row, i) => <li key={i} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words"><span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colours[i] }} />{row.name}</span><span className="tabular-nums">{formatMoney(row.value, currency)} · {(row.value / total * 100).toFixed(1)}%</span></li>)}</ul>
    </div>
    {rows.filter(row => row.value > 0).length > 6 ? <p className="mt-3 text-xs text-slate-600">Five largest shares shown separately; Other includes every remaining positive value. The table keeps all records.</p> : null}
  </figure>;
}

export function TrendLine({ title, labels, values, currency, tone = 'sales' }: { title: string; labels: string[]; values: number[]; currency: string; tone?: 'sales' | 'profit' }) {
  const id = useId();
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(540);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [labels, values]);
  const actual = labels.map((_, i) => values[i] ?? 0);
  if (!actual.length || actual.every(value => value === 0)) return <p className="py-8 text-sm text-slate-600">No values for {title.toLowerCase()} in these dates.</p>;
  const min = Math.min(0, ...actual), max = Math.max(0, ...actual), range = max - min || 1;
  const stroke = tone === 'profit' ? (min < 0 ? '#b45309' : '#08916c') : '#2454d9';
  const x = (i: number) => 12 + (actual.length === 1 ? (width - 24) / 2 : i / (actual.length - 1) * (width - 24));
  const y = (v: number) => 175 - (v - min) / range * 145;
  return <figure ref={container} className="min-w-0">
    <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
    <p className="mb-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-600"><span>Scale low: {formatMoney(min, currency)}</span><span>Scale high: {formatMoney(max, currency)}</span></p>
    <svg viewBox={`0 0 ${width} 210`} className="h-[210px] w-full" preserveAspectRatio="none" role="img" aria-labelledby={id}>
      <title id={id}>{`${title}. From ${labels[0]} to ${labels.at(-1)}. Exact daily figures follow.`}</title>
      {[0, 0.5, 1].map(t => <line key={t} x1="12" x2={width - 12} y1={30 + t * 145} y2={30 + t * 145} stroke="#dce3ef" strokeDasharray="4 4" />)}
      <line x1="12" x2={width - 12} y1={y(0)} y2={y(0)} stroke="#94a3b8" />
      <polyline points={actual.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      {actual.map((value, i) => <circle key={i} cx={x(i)} cy={y(value)} r="4" fill={stroke}><title>{`${labels[i]}: ${formatMoney(value, currency)}`}</title></circle>)}

    </svg>
    <div className="flex justify-between gap-2 text-xs text-slate-600"><span>{labels[0]}</span><span>{labels.at(-1)}</span></div>
    <details className="text-sm"><summary className="min-h-11 cursor-pointer rounded-lg py-2 font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{title} — exact daily figures</summary><dl className="space-y-2">{actual.map((value, i) => <div key={i} className="flex flex-wrap justify-between gap-2"><dt>{labels[i]}</dt><dd className="tabular-nums">{formatMoney(value, currency)}</dd></div>)}</dl></details>
  </figure>;
}

export function PeriodComparisonChart({ rows, currency, currentLabel, previousLabel, columns = false }: { columns?: boolean; rows: { name: string; current: number; previous: number }[]; currency: string; currentLabel: string; previousLabel: string }) {
  const max = Math.max(1, ...rows.flatMap(row => [Math.abs(row.current), Math.abs(row.previous)]));
  return <figure className="min-w-0">
    <figcaption className="mb-4 flex flex-wrap gap-4 text-sm"><span><span className="mr-2 inline-block h-3 w-3 rounded bg-blue-700" />{currentLabel}</span><span><span className="mr-2 inline-block h-3 w-3 rounded bg-slate-400" />{previousLabel}</span></figcaption>
    {columns ? <div className="grid min-w-0 grid-cols-3 items-end gap-3 border-b border-slate-200 pb-3">{rows.map(row => <div key={row.name} className="min-w-0">
      <div aria-hidden="true" className="flex h-32 items-end justify-center gap-2">{[{ value: row.current, colour: '#2454d9' }, { value: row.previous, colour: '#94a3b8' }].map((item, i) => <div key={i} className="w-7 max-w-[40%] rounded-t" style={{ height: `${Math.abs(item.value) / max * 100}%`, minHeight: item.value ? '2px' : '0', backgroundColor: item.colour }} />)}</div>
      <h3 className="mt-3 break-words text-sm font-semibold">{row.name}</h3>
    </div>)}</div> : <div className="grid min-w-0 gap-5 sm:grid-cols-3">{rows.map(row => <div key={row.name} className="min-w-0"><h3 className="mb-2 text-sm font-semibold">{row.name}</h3>{[{ value: row.current, label: currentLabel, colour: '#2454d9' }, { value: row.previous, label: previousLabel, colour: '#94a3b8' }].map(item => <div key={item.label} className="mb-3 text-sm"><div className="mb-1 flex flex-wrap justify-between gap-1"><span className="text-slate-600">{item.label}</span><span className="tabular-nums">{formatMoney(item.value, currency)}</span></div><div aria-hidden="true" className="h-5 rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${Math.abs(item.value) / max * 100}%`, backgroundColor: item.colour }} /></div></div>)}</div>)}</div>}
    {columns ? <dl className="mt-4 space-y-3">{rows.map(row => <div key={row.name} className="min-w-0 border-b border-slate-100 pb-3"><dt className="mb-2 text-sm font-semibold">{row.name}</dt><dd className="grid min-w-0 gap-3 sm:grid-cols-2">{[{ label: currentLabel, value: row.current }, { label: previousLabel, value: row.previous }].map(item => <div key={item.label} className="min-w-0"><p className="text-xs text-slate-600">{item.label}</p><div className="financial-fit mt-1"><FinancialAmount pence={item.value} currency={currency} className="!text-base" /></div></div>)}</dd></div>)}</dl> : null}
    <p className="mt-2 text-xs text-slate-600">Bars compare magnitude on one scale. Amounts retain their signs. Sales, receipts and refunds are separate measures and must not be added together.</p>
  </figure>;
}
