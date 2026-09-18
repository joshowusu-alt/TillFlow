import type { ReactNode } from 'react';

export type AccountingLine = {
  id: string;
  side: 'debit' | 'credit';
  account: string;
  amountLabel: string;
  note?: string;
};

type AccountingDetailsProps = {
  lines: AccountingLine[];
  title?: string;
  children?: ReactNode;
};

/**
 * Technical debit/credit disclosure. Keep the owner-facing total outside this block.
 * Do not hide warnings — render those beside the parent record, not inside this disclosure.
 *
 * Usage (Agent 2/3 integrator):
 *   <AccountingDetails lines={[{ id: '1', side: 'debit', account: '5100 Inventory loss', amountLabel: 'GHS 12.00' }, { id: '2', side: 'credit', account: '1200 Inventory', amountLabel: 'GHS 12.00' }]} />
 */
export default function AccountingDetails({
  lines,
  title = 'Accounting details',
  children,
}: AccountingDetailsProps) {
  if (lines.length === 0 && !children) return null;

  return (
    <details className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2" data-accounting-details>
      <summary className="min-h-[44px] cursor-pointer list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="mt-2 space-y-2 text-sm">
        {lines.map((line) => (
          <div
            key={line.id}
            className="flex items-start justify-between gap-3"
            data-accounting-side={line.side}
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-black/40">
                {line.side === 'debit' ? 'Debit' : 'Credit'}
              </div>
              <div className="font-medium text-ink">{line.account}</div>
              {line.note ? <div className="text-xs text-black/50">{line.note}</div> : null}
            </div>
            <div className="tabular-nums font-semibold">{line.amountLabel}</div>
          </div>
        ))}
        {children}
      </div>
    </details>
  );
}
