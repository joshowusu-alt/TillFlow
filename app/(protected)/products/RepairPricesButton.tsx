'use client';

import { useState } from 'react';
import { repairInflatedPricesAction } from '@/app/actions/products';

export default function RepairPricesButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [message, setMessage] = useState('');

  async function handleRepair() {
    if (!confirm('This will divide prices by 100 for any product priced above ₵1,000. Continue?')) return;
    setStatus('loading');
    const result = await repairInflatedPricesAction();
    if (result.success) {
      const { fixed } = result.data;
      setMessage(fixed === 0 ? 'No inflated prices found — all good!' : `Fixed ${fixed} product${fixed !== 1 ? 's' : ''}. Prices divided by 100.`);
    } else {
      setMessage(result.error ?? 'Something went wrong.');
    }
    setStatus('done');
  }

  return (
    <div className="card p-4 flex items-center gap-4 bg-amber-50 border border-amber-200">
      <div className="flex-1 text-sm">
        <strong>Price repair:</strong> If prices look inflated (e.g. ₵3,500 instead of ₵35),
        click to auto-fix all products priced above ₵1,000 by dividing by 100.
      </div>
      {status === 'done' ? (
        <span className="text-sm font-medium text-green-700">{message}</span>
      ) : (
        <button
          onClick={handleRepair}
          disabled={status === 'loading'}
          className="btn-primary whitespace-nowrap text-sm"
        >
          {status === 'loading' ? 'Fixing…' : 'Repair prices'}
        </button>
      )}
    </div>
  );
}
