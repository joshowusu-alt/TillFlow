'use client';

import ResponsiveModal from '@/components/ResponsiveModal';
import { formatMoney } from '@/lib/format';

type Props = { open: boolean; count: number; total: number; currency: string; onCancel: () => void; onConfirm: () => void };

export default function ClearCartDialog({ open, count, total, currency, onCancel, onConfirm }: Props) {
  return <ResponsiveModal open={open} onClose={onCancel} labelledBy="pos-clear-title" maxWidthClassName="max-w-md" panelClassName="max-sm:mb-[calc(env(safe-area-inset-bottom,0px)+2rem)]" closeOnEscape={false}>
    <div className="p-5" onKeyDown={event => {
      event.stopPropagation();
      // Keep Escape inside this confirmation when it sits over the phone cart sheet.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === 'Tab') {
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <h2 id="pos-clear-title" className="text-lg font-bold text-slate-950">Clear this cart?</h2>
      <p className="mt-2 text-sm text-slate-600">Remove {count} product {count === 1 ? 'line' : 'lines'} totalling {formatMoney(total, currency)} from this sale. Customer, payment and discount details will also reset.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" data-autofocus="true" className="btn-secondary min-h-11" onClick={onCancel}>Keep cart</button>
        <button type="button" className="min-h-11 rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white hover:bg-rose-800" onClick={onConfirm}>Clear cart</button>
      </div>
    </div>
  </ResponsiveModal>;
}
