'use client';

import { useState } from 'react';
import type { PosCustomerOption } from '@/hooks/usePosCustomers';

type CustomerSelectorProps = {
  requiresCustomer: boolean;
  customerId: string;
  customerOptions: PosCustomerOption[];
  customerSearch: string;
  customerSearchError: string | null;
  onCustomerSearchChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  onQuickAdd: () => void;
};

export default function CustomerSelector({
  requiresCustomer,
  customerId,
  customerOptions,
  customerSearch,
  customerSearchError,
  onCustomerSearchChange,
  onCustomerChange,
  onQuickAdd,
}: CustomerSelectorProps) {
  const [editing, setEditing] = useState(false);
  const expanded = requiresCustomer || editing;
  const selected = customerOptions.find(customer => customer.id === customerId);
  if (!expanded) return <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2" data-pos-customer-summary="true"><input type="hidden" name="customerId" value={customerId} /><div className="min-w-0"><div className="text-xs text-slate-500">Customer</div><div className="break-words text-sm font-semibold">{customerId ? selected?.name ?? 'Selected customer' : 'Walk-in'}</div></div><button type="button" className="min-h-11 px-2 text-sm font-semibold text-accent" onClick={() => setEditing(true)}>Change customer</button></div>;
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end ${requiresCustomer && !customerId ? 'rounded-lg border-2 border-amber-400 bg-amber-50 p-3' : ''}`}>
      <div className="flex-1">
        <label className="label" htmlFor="pos-customer-select">{requiresCustomer ? 'Customer (required)' : 'Customer'}</label>
        <input
          type="text"
          aria-label="Search customers"
          className="input mb-1"
          placeholder="Search by name or phone…"
          value={customerSearch}
          onChange={(e) => onCustomerSearchChange(e.target.value)}
        />
        {customerSearchError ? (
          <div className="mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {customerSearchError}
          </div>
        ) : null}
        <select
          className="input"
          id="pos-customer-select"
          name="customerId"
          value={customerId}
          onChange={(e) => onCustomerChange(e.target.value)}
        >
          <option value="">{requiresCustomer ? 'Select a customer…' : 'Walk-in / No customer'}</option>
          {customerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
      </div>
      {!requiresCustomer ? <button type="button" className="min-h-11 text-sm font-semibold text-accent" onClick={() => { setEditing(false); onCustomerSearchChange(''); }}>Done</button> : null}
      <button
        type="button"
        className="btn-secondary w-full text-xs sm:mt-0 sm:w-auto sm:whitespace-nowrap"
        onClick={onQuickAdd}
      >
        + New
      </button>
    </div>
  );
}
