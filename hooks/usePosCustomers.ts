'use client';

import { useEffect, useMemo, useState } from 'react';

export type PosCustomerOption = {
  id: string;
  name: string;
};

function dedupeCustomers(customers: PosCustomerOption[]) {
  const seen = new Set<string>();
  return customers.filter((customer) => {
    if (seen.has(customer.id)) return false;
    seen.add(customer.id);
    return true;
  });
}

export function usePosCustomers(initialCustomers: PosCustomerOption[]) {
  const baseCustomers = useMemo(
    () => dedupeCustomers(initialCustomers),
    [initialCustomers]
  );
  const [customerOptions, setCustomerOptions] = useState<PosCustomerOption[]>(baseCustomers);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerOptions(baseCustomers);
      setCustomerSearchError(null);
    }
  }, [baseCustomers, customerSearch]);

  useEffect(() => {
    const query = customerSearch.trim();
    if (!query) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) {
          throw new Error(`Customer search failed (${res.status})`);
        }

        const data: { customers: PosCustomerOption[] } = await res.json();
        setCustomerOptions(dedupeCustomers(data.customers));
        setCustomerSearchError(null);
      } catch {
        setCustomerSearchError('Customer search is unavailable right now. Showing your saved shortlist instead.');
        setCustomerOptions(baseCustomers);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [baseCustomers, customerSearch]);

  const addCustomerOption = (customer: PosCustomerOption) => {
    setCustomerOptions((prev) => dedupeCustomers([customer, ...prev]));
    setCustomerSearch('');
    setCustomerSearchError(null);
  };

  return {
    customerOptions,
    customerSearch,
    customerSearchError,
    setCustomerSearch,
    addCustomerOption,
  };
}
