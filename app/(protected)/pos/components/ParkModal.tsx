'use client';

import { memo, useState } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';

const QUICK_LABELS = ['Counter hold', 'Needs change', 'Customer returning'];

type ParkModalProps = {
  itemCount: number;
  onPark: (label: string) => void;
  onClose: () => void;
};

function ParkModalInner({ itemCount, onPark, onClose }: ParkModalProps) {
  const [label, setLabel] = useState('');
  const suggestedLabel = label.trim() || `Sale (${itemCount} items)`;

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      ariaLabel="Park current sale"
      maxWidthClassName="max-w-sm"
      panelClassName="p-6"
    >
      <h3 className="text-lg font-display font-semibold">Park Sale</h3>
      <p className="mt-1 text-sm text-black/50">
        Save this cart and serve another customer. You can recall it later.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_LABELS.map((quickLabel) => (
          <button
            key={quickLabel}
            type="button"
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
            onClick={() => setLabel(quickLabel)}
          >
            {quickLabel}
          </button>
        ))}
      </div>
      <input
        className="input mt-4"
        placeholder="Label (e.g. customer name)…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onPark(label);
          }
        }}
        autoFocus
      />
      <div className="mt-2 rounded-xl bg-black/[.03] px-3 py-2 text-xs text-black/50">
        Saved as <span className="font-semibold text-black/70">{suggestedLabel}</span>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button className="btn-primary flex-1" onClick={() => onPark(label)}>
          Park ({itemCount} items)
        </button>
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ResponsiveModal>
  );
}

const ParkModal = memo(ParkModalInner);
export default ParkModal;
