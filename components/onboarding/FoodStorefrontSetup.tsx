'use client';

import { useState } from 'react';
import { saveFoodStorefrontSetupAction, type ReadinessData } from '@/app/actions/onboarding';
import StorefrontPickupHours from '@/components/StorefrontPickupHours';
import { makeDefaultWeeklyHours, parseWeeklyHours } from '@/lib/business-hours';
import { DEFAULT_FOOD_PREP_MINUTES } from '@/lib/food/storefront-defaults';

export default function FoodStorefrontSetup({ settings }: { settings: ReadinessData['foodStorefront'] }) {
  const existingHours = parseWeeklyHours(settings?.storefrontHoursJson);
  const [hoursEnabled, setHoursEnabled] = useState(true);
  const [status, setStatus] = useState<'editing' | 'saved' | 'skipped'>('editing');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (status !== 'editing') {
    return <p role="status" className="mb-5 text-sm text-muted">
      {status === 'saved' ? 'Storefront details saved.' : 'Storefront setup skipped. You can add these details in Online Store settings.'}
    </p>;
  }

  return (
    <form className="mb-5 space-y-3 rounded-2xl border border-border bg-white p-4" onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setError('');
      setPending(true);
      try {
        const result = await saveFoodStorefrontSetupAction(formData);
        if (result.success) setStatus('saved');
        else setError(result.error);
      } catch {
        setError('Could not save storefront details. Try again.');
      } finally {
        setPending(false);
      }
    }}>
      <h2 className="font-semibold">Online storefront hours and preparation time</h2>
      <p className="text-sm text-muted">Tell customers when they can collect an order and how long it takes to prepare.</p>
      <label className="block text-sm">
        Preparation time in minutes
        <input className="input mt-1" type="number" name="pickupPrepMinutes" min={0} max={1440}
          defaultValue={settings?.storefrontPickupPrepMinutes || DEFAULT_FOOD_PREP_MINUTES} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="hoursEnabled" checked={hoursEnabled}
          onChange={(event) => setHoursEnabled(event.target.checked)} />
        Set opening hours
      </label>
      <div hidden={!hoursEnabled}>
        <StorefrontPickupHours initialHours={existingHours ?? makeDefaultWeeklyHours()} />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} type="submit">Save storefront details</button>
        <button className="btn-secondary" disabled={pending} type="button" onClick={() => setStatus('skipped')}>Skip for now</button>
      </div>
    </form>
  );
}
