'use client';

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
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end ${requiresCustomer && !customerId ? 'rounded-lg border-2 border-amber-400 bg-amber-50 p-3' : ''}`}>
      <div className="flex-1">
        <label className="label">{requiresCustomer ? 'Customer (required)' : 'Customer'}</label>
        <input
          type="text"
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
