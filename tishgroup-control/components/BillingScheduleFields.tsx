'use client';

import { useEffect, useState } from 'react';

type BillingCadence = 'MONTHLY' | 'ANNUAL';

function normalizeDateInput(value?: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

function addBillingInterval(dateValue: string, cadence: BillingCadence) {
  if (!dateValue) return '';

  const [year, month, day] = dateValue.split('-').map((part) => parseInt(part, 10));
  if (!year || !month || !day) return '';

  const next = new Date(year, month - 1, day);
  if (cadence === 'ANNUAL') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  const nextYear = next.getFullYear();
  const nextMonth = String(next.getMonth() + 1).padStart(2, '0');
  const nextDay = String(next.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export default function BillingScheduleFields({
  defaultCadence = 'MONTHLY',
  defaultStartDate,
  defaultNextDueDate,
}: {
  defaultCadence?: BillingCadence;
  defaultStartDate?: string | null;
  defaultNextDueDate?: string | null;
}) {
  const normalizedStartDate = normalizeDateInput(defaultStartDate);
  const normalizedNextDueDate = normalizeDateInput(defaultNextDueDate);
  const [billingCadence, setBillingCadence] = useState<BillingCadence>(defaultCadence);
  const [startDate, setStartDate] = useState(normalizedStartDate);
  const [nextDueDate, setNextDueDate] = useState(
    normalizedNextDueDate || addBillingInterval(normalizedStartDate, defaultCadence)
  );
  const [nextDueTouched, setNextDueTouched] = useState(Boolean(normalizedNextDueDate));

  useEffect(() => {
    if (!startDate || nextDueTouched) return;
    setNextDueDate(addBillingInterval(startDate, billingCadence));
  }, [billingCadence, startDate, nextDueTouched]);

  return (
    <>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Billing cadence</span>
        <select
          name="billingCadence"
          value={billingCadence}
          onChange={(event) => setBillingCadence(event.target.value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY')}
          className="control-field"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Subscription start date</span>
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            if (!event.target.value) {
              setNextDueDate('');
              setNextDueTouched(false);
            }
          }}
          className="control-field"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">First due date</span>
        <input
          type="date"
          name="nextDueDate"
          value={nextDueDate}
          onChange={(event) => {
            setNextDueDate(event.target.value);
            setNextDueTouched(Boolean(event.target.value));
          }}
          className="control-field"
        />
      </label>
    </>
  );
}