'use client';

import { useEffect, useState, type ReactNode } from 'react';

type BulkActionStaffOption = {
  id: string;
  name: string;
  role: string;
};

type BulkActionConfig = {
  action: (formData: FormData) => void | Promise<void>;
  returnPath: string;
  staffOptions: BulkActionStaffOption[];
  submitLabel?: (count: number) => string;
};

type BulkRosterClientProps = {
  rosterId: string;
  totalOnPage: number;
  children: ReactNode;
  bulkAction: BulkActionConfig;
};

/**
 * Wrapper around the businesses listing that tracks per-row selection
 * via uncontrolled checkbox inputs (so each row in the static markup
 * just renders <input type="checkbox" name="selectedId" data-roster-id>).
 *
 * Selection state lives on the client. The bulk-action form is rendered
 * inside this component because it needs access to the live selectedIds —
 * functions can't cross the server/client boundary, so the page passes
 * a serializable BulkActionConfig (server action ref + data) instead of
 * a render prop.
 */
export default function BulkRosterClient({ rosterId, totalOnPage, children, bulkAction }: BulkRosterClientProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox') return;
      if (target.dataset.rosterId !== rosterId) return;
      const id = target.value;
      // Desktop and mobile render the same accounts. Keep their selections aligned on rotation.
      document.querySelectorAll<HTMLInputElement>(`input[data-roster-id="${rosterId}"]`).forEach(input => {
        if (input.value === id) input.checked = target.checked;
      });
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

  useEffect(() => {
    setSelected(new Set());
    document.querySelectorAll<HTMLInputElement>(`input[data-roster-id="${rosterId}"]`).forEach(input => { input.checked = false; });
  }, [rosterId, totalOnPage, bulkAction.returnPath]);

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
  const selectedIds = Array.from(selected);
  const submitLabel = bulkAction.submitLabel
    ? bulkAction.submitLabel(count)
    : `Review ${count} selected`;

  return (
    <>
      {children}

      {visible ? <div
        role="region"
        aria-label="Selected businesses"
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[calc(var(--safe-bottom)+0.5rem)] transition-transform duration-200 sm:px-4 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="pointer-events-auto mx-auto max-h-[65dvh] max-w-[1200px] overflow-y-auto overscroll-contain rounded-[20px] border border-black/10 bg-control-dark px-3 py-3 text-white shadow-2xl sm:px-4 sm:py-3.5">
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
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-white/15 bg-white/8 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/12"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-white/15 bg-transparent px-3 text-xs font-semibold text-white/75 transition hover:bg-white/8"
              >
                Cancel
              </button>
            </div>
          </div>

          {visible ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <form action={bulkAction.action} className="space-y-2.5">
                <input type="hidden" name="returnPath" value={bulkAction.returnPath} />
                {selectedIds.map((id) => (
                  <input key={id} type="hidden" name="selectedId" value={id} />
                ))}
                <div className="grid gap-2 sm:grid-cols-2">
                  <select aria-label="Assign selected businesses" name="assignedManagerId" defaultValue="SELF" className="h-11 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white">
                    <option value="SELF">Assign to me</option>
                    <option value="UNASSIGNED">Leave unassigned</option>
                    {bulkAction.staffOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} · {option.role.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Plan for selected businesses" name="purchasedPlan" defaultValue="KEEP_CURRENT" className="h-11 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white">
                    <option value="KEEP_CURRENT">Keep sold plan</option>
                    <option value="STARTER">Starter</option>
                    <option value="GROWTH">Growth</option>
                    <option value="PRO">Pro</option>
                  </select>
                </div>
                <input
                  type="text"
                  aria-label="Review note" name="reviewNote"
                  placeholder="Optional review note"
                  className="h-11 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white placeholder:text-white/45"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-white px-3 text-sm font-bold text-control-ink transition hover:bg-white/90"
                >
                  {submitLabel}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div> : null}
      {visible ? <div className="h-80" aria-hidden="true" /> : null}
    </>
  );
}
