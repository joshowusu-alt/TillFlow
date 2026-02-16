'use client';

import { memo, useState } from 'react';

type ParkModalProps = {
  itemCount: number;
  onPark: (label: string) => void;
  onClose: () => void;
};

function ParkModalInner({ itemCount, onPark, onClose }: ParkModalProps) {
  const [label, setLabel] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-display font-semibold">Park Sale</h3>
        <p className="text-sm text-black/50 mt-1">
          Save this cart and serve another customer. You can recall it later.
        </p>
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
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={() => onPark(label)}>
            Park ({itemCount} items)
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const ParkModal = memo(ParkModalInner);
export default ParkModal;
