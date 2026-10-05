'use client';

import { useId, useState } from 'react';
import { REPORT_FOCUS } from './ReportPrimitives';

export default function BusyTradingTimes({ rows }: { rows: { day: string; hour: number; sales: number }[] }) {
  const id = useId();
  const [day, setDay] = useState('Mon');
  const [hour, setHour] = useState(12);
  const selected = rows.find(row => row.day === day && row.hour === hour)?.sales ?? 0;
  const values = rows.filter(row => row.day === day && row.sales > 0).sort((a, b) => a.hour - b.hour);
  const max = Math.max(...values.map(row => row.sales), 1);
  return <div className="space-y-3">
    <p className="text-sm leading-5 text-slate-600">Sale counts by business-local weekday and hour, summed across the selected period. Peak hour above is ranked by revenue.</p>
    <div className="grid grid-cols-2 gap-3">
      <div className="text-sm font-semibold text-ink"><label htmlFor={`${id}-day`}>Day</label><select id={`${id}-day`} value={day} onChange={event => setDay(event.target.value)} className={`input mt-1 min-h-11 w-full ${REPORT_FOCUS}`}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(name => <option key={name}>{name}</option>)}</select></div>
      <div className="text-sm font-semibold text-ink"><label htmlFor={`${id}-hour`}>Hour</label><select id={`${id}-hour`} value={hour} onChange={event => setHour(Number(event.target.value))} className={`input mt-1 min-h-11 w-full ${REPORT_FOCUS}`}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}</select></div>
    </div>
    <p className="rounded-xl bg-accentSoft p-3 text-sm font-semibold text-accent" aria-live="polite">{day} {String(hour).padStart(2, '0')}:00–{String(hour + 1).padStart(2, '0')}:00 · {selected.toLocaleString()} sales</p>
    <div aria-hidden="true" className="space-y-2">{values.length ? values.map(row => <div key={row.hour} className="flex items-center gap-3 text-sm text-ink"><span className="w-12 shrink-0">{String(row.hour).padStart(2, '0')}:00</span><div className="h-3 flex-1 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-accent" style={{ width: `${row.sales / max * 100}%` }} /></div><span className="w-8 text-right">{row.sales}</span></div>) : <p className="text-sm text-slate-600">No recorded sales on {day} in this period.</p>}</div>
  </div>;
}
