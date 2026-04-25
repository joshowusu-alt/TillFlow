'use client';

import { useEffect, useState, type ReactNode } from 'react';

type BulkRosterClientProps = {
  rosterId: string;
  totalOnPage: number;
  children: ReactNode;
  /** Slot for the bulk-action panel (form, fields, submit button). The
   *  client wrapper renders this inside a bottom sheet whose visibility
   *  is bound to selection count. */
  bulkActions: (selectedIds: string[]) => ReactNode;
};

/**
 * Wrapper around the businesses listing that tracks per-row selection
 * via uncontrolled checkbox inputs (so each row in the static markup
 * just renders <input type="checkbox" name="selectedId" data-roster-id>).
 *
 * The wrapper listens for change events bubbling up from those
 * checkboxes, keeps a Set of selected ids in state, and renders a
 * sticky bottom action bar when at least one is selected. The bar holds
 * the bulk-action form. Mobile-first: at md+ screens the bar still
 * appears at bottom but is more compact.
 */
export default function BulkRosterClient({ rosterId, totalOnPage, children, bulkActions }: BulkRosterClientProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox') return;
      if (target.dataset.rosterId !== rosterId) return;
      const id = target.value;
      setSelected((prev) => {
        const next = new Set(prev);
        if (target.checked) next.add(id);
        else next.delete(id);
        return next;
      });
    }
    document.addEventListener('change', handleChange);
    return () => document.removeEventListener('change', handleChange);
  }, [rosterId]);

  function clearSelection() {
    setSelected(new Set());
    document.querySelectorAll<HTMLInputElement>(`input[data-roster-id="${rosterId}"]`).forEach((el) => {
      el.checked = false;
    });
  }

  function selectAll() {
    const ids = new Set<string>();
    document.querySelectorAll<HTMLInputElement>(`input[data-roster-id="${rosterId}"]`).forEach((el) => {
      el.checked = true;
      ids.add(el.value);
    });
    setSelected(ids);
  }

  const count = selected.size;
  const visible = count > 0;
  const allSelected = count > 0 && count === totalOnPage;

  return (
    <>
      {children}

      <div
        aria-hidden={!visible}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[calc(var(--safe-bottom)+0.5rem)] transition-transform duration-200 sm:px-4 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="pointer-events-auto mx-auto max-w-[1200px] rounded-[20px] border border-black/10 bg-[#122126] px-3 py-3 text-white shadow-2xl sm:px-4 sm:py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white/12 px-2 text-xs font-bold tabular-nums">
                {count}
              </span>
              <span className="text-sm font-semibold tracking-tight">selected</span>
              <span className="hidden text-xs text-white/55 sm:inline">of {totalOnPage} on page</span>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={allSelected ? clearSelection : selectAll}
                className="inline-flex h-9 items-center justify-center rounded-[14px] border border-white/15 bg-white/8 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/12"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-9 items-center justify-center rounded-[14px] border border-white/15 bg-transparent px-3 text-xs font-semibold text-white/75 transition hover:bg-white/8"
              >
                Cancel
              </button>
            </div>
          </div>

          {visible ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              {bulkActions(Array.from(selected))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
