'use client';
import { useState } from 'react';
import { DAY_KEYS, DAY_LABELS, type WeeklyHours } from '@/lib/business-hours';

export default function StorefrontPickupHours({ initialHours }: { initialHours: WeeklyHours }) {
  const [hours, setHours] = useState(initialHours);
  return <div className="space-y-3">{DAY_KEYS.map(day => {
    const value = hours[day];
    return <fieldset key={day} className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">{DAY_LABELS[day]}</legend>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div><label className="label" htmlFor={day + '-open'}>Opens</label><input id={day + '-open'} aria-label={DAY_LABELS[day] + ' opens'} className="input min-w-0 px-2" type="time" name={day + '_open'} value={value.open} disabled={value.closed} onChange={event => setHours(previous => ({ ...previous, [day]: { ...previous[day], open: event.target.value } }))} /></div>
        <div><label className="label" htmlFor={day + '-close'}>Closes</label><input id={day + '-close'} aria-label={DAY_LABELS[day] + ' closes'} className="input min-w-0 px-2" type="time" name={day + '_close'} value={value.close} disabled={value.closed} onChange={event => setHours(previous => ({ ...previous, [day]: { ...previous[day], close: event.target.value } }))} /></div>
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm sm:col-span-1"><input aria-label={'Closed on ' + DAY_LABELS[day]} type="checkbox" name={day + '_closed'} checked={!!value.closed} onChange={event => setHours(previous => ({ ...previous, [day]: { ...previous[day], closed: event.target.checked } }))} />Closed<span className="sr-only"> on {DAY_LABELS[day]}</span></label>
        {value.closed && <><input type="hidden" name={day + '_open'} value={value.open} /><input type="hidden" name={day + '_close'} value={value.close} /></>}
      </div>
    </fieldset>;
  })}</div>;
}
