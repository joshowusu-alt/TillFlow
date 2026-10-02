import type { ReactNode } from 'react';

/** Keyboard/touch-readable counterpart to a visual chart, using the same data. */
export default function ReportChartData({ title, columns, rows, children }: {
  title: string;
  columns: string[];
  rows: string[][];
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div role="img" aria-label={title}><div aria-hidden="true">{children}</div></div>
      <details className="mt-2 rounded-xl border border-slate-200 bg-white px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{title} — view figures</summary>
        <div className="max-h-96 overflow-auto pb-3" tabIndex={0} role="region" aria-label={`${title} figures`}>
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead><tr>{columns.map((column, index) => <th key={index} scope="col" className="sticky top-0 bg-white p-2 text-ink">{column}</th>)}</tr></thead>
            <tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-t border-slate-100">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-2 text-slate-700">{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="p-2">No data for this period.</td></tr>}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
