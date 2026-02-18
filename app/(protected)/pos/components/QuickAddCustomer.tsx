'use client';

import { useState, useTransition } from 'react';
import { quickCreateCustomerAction } from '@/app/actions/customers';

type Props = {
  currency: string;
  onCreated: (customer: { id: string; name: string }) => void;
  onClose: () => void;
};

export default function QuickAddCustomer({ currency, onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Customer name is required.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await quickCreateCustomerAction({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          creditLimitPence: Math.round(Number(creditLimit || 0) * 100),
        });
        if (result.success) {
          onCreated(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setError('Unable to create customer. Please try again.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-display font-semibold">Quick Add Customer</h3>
        <p className="mt-1 text-sm text-black/50">Create a customer without leaving POS.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 024xxxxxxx"
            />
          </div>
          <div>
            <label className="label">Email (optional)</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <label className="label">Credit Limit ({currency})</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? 'Creating...' : 'Create Customer'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
