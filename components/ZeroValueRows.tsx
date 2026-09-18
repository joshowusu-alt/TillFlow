'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type ZeroValueRow = {
  id: string;
  label: string;
  value: number;
  /** Warnings and incomplete records stay visible even when the amount is 0. */
  warning?: boolean;
  incomplete?: boolean;
  render?: () => ReactNode;
};

type ZeroValueRowsProps = {
  rows: ZeroValueRow[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
};

function isMaterialZero(row: ZeroValueRow) {
  return row.value === 0 && !row.warning && !row.incomplete;
}

/**
 * Collapse non-material zero payment-method / report rows.
 * Never hides warning or incomplete records. Integrator wires this on money reports.
 */
export default function ZeroValueRows({
  rows,
  formatValue = (value) => String(value),
  emptyLabel = 'No rows.',
}: ZeroValueRowsProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = useMemo(() => rows.filter(isMaterialZero).length, [rows]);
  const visible = expanded ? rows : rows.filter((row) => !isMaterialZero(row));

  if (rows.length === 0) {
    return <p className="text-sm text-black/50">{emptyLabel}</p>;
  }

  return (
    <div data-zero-value-rows>
      <ul className="space-y-2">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-3 py-2 text-sm"
            data-zero-value-row={row.id}
            data-warning={row.warning ? 'true' : undefined}
            data-incomplete={row.incomplete ? 'true' : undefined}
          >
            {row.render ? (
              row.render()
            ) : (
              <>
                <span>
                  {row.label}
                  {row.warning ? (
                    <span className="ml-2 text-xs font-medium text-amber-800">Warning</span>
                  ) : null}
                  {row.incomplete ? (
                    <span className="ml-2 text-xs font-medium text-rose-700">Incomplete</span>
                  ) : null}
                </span>
                <span className="tabular-nums font-semibold">{formatValue(row.value)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="btn-ghost mt-3 min-h-[44px] text-xs"
          onClick={() => setExpanded((current) => !current)}
          data-zero-value-expand
        >
          {expanded ? 'Hide zero rows' : `Expand all (${hiddenCount} zero ${hiddenCount === 1 ? 'row' : 'rows'})`}
        </button>
      ) : null}
    </div>
  );
}
