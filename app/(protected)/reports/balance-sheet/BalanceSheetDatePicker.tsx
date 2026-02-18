'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function BalanceSheetDatePicker({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    startTransition(() => {
      router.push(`/reports/balance-sheet?asOf=${newDate}`);
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <label className="label">As of</label>
        <input
          className="input"
          type="date"
          defaultValue={defaultValue}
          onChange={(e) => handleDateChange(e.target.value)}
        />
      </div>
      {isPending ? (
        <div className="flex items-end">
          <div className="text-sm text-black/50 animate-pulse">Updating...</div>
        </div>
      ) : null}
    </div>
  );
}
