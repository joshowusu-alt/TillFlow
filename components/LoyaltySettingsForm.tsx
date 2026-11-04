'use client';
import { useEffect, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { computePointsEarned, pointsToDiscountPence } from '@/lib/loyalty';

type Props = { enabled: boolean; earnRate: number; redemptionPence: number };
export default function LoyaltySettingsForm({ enabled, earnRate, redemptionPence }: Props) {
  const [active, setActive] = useState(enabled);
  const [earn, setEarn] = useState(String(earnRate));
  const [redeem, setRedeem] = useState((redemptionPence / 100).toFixed(2));
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const points = computePointsEarned(10000, Number(earn));
  const discount = pointsToDiscountPence(points, Math.round(Number(redeem) * 100));
  const valid = Number.isInteger(Number(earn)) && Number(earn) >= 1 && Number.isFinite(Number(redeem)) && Number(redeem) >= 0.01;
  return <form action={updateLoyaltySettingsAction} className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.85fr)]">
    <fieldset disabled={!ready} className="card min-w-0 space-y-5 p-4 sm:p-6">
      <legend className="sr-only">Loyalty rules</legend>
      <div><h2 className="text-lg font-display font-semibold">Loyalty rules</h2><p className="mt-1 text-sm text-muted">Set how customers earn points and what each block of points is worth.</p></div>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4"><input className="mt-1 h-4 w-4" name="loyaltyEnabled" type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /><span><span className="block font-semibold">Enable loyalty programme</span><span className="text-sm text-muted">Award points on paid sales and allow redemption at checkout.</span></span></label>
      <div><label className="label" htmlFor="loyalty-earn">Points earned per GHS 1.00 spent</label><input id="loyalty-earn" className="input" type="number" min="1" step="1" name="loyaltyPointsPerGhsPence" value={earn} onChange={event => setEarn(event.target.value)} required /><p className="mt-1 text-xs text-muted">Points are earned for each whole GHS spent.</p></div>
      <div><label className="label" htmlFor="loyalty-redeem">Discount per 100 points (GHS)</label><input id="loyalty-redeem" className="input" type="number" min="0.01" step="0.01" name="loyaltyRedemptionAmount" value={redeem} onChange={event => setRedeem(event.target.value)} required /><p className="mt-1 text-xs text-muted">Enter 1.00 to give GHS 1.00 off for every 100 points.</p></div>
      <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto" loadingText="Saving…" disabled={!ready || !valid}>Save loyalty settings</SubmitButton>
    </fieldset>
    <section aria-labelledby="loyalty-example-heading" className="card min-w-0 space-y-4 p-4 sm:p-6">
      <h2 id="loyalty-example-heading" className="text-lg font-display font-semibold">Reward preview</h2>
      <p className="text-sm text-muted">Try rates before saving. This example assumes loyalty is enabled.</p>
      <div aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{valid ? <>A GHS 100.00 purchase earns <strong>{points.toLocaleString()} points</strong>. Those points can give <strong>GHS {(discount / 100).toFixed(2)}</strong> off a future purchase.</> : 'Enter valid earning and discount amounts to see an example.'}</div>
      <ul className="space-y-2 text-sm text-muted"><li>Select a customer at checkout to earn or redeem points.</li><li>Redemption uses complete blocks of 100 points. Smaller balances carry forward.</li><li>Changes apply after saving. Existing customer points remain in their accounts.</li></ul>
      {!active && <p className="rounded-xl bg-black/5 p-3 text-sm text-muted">The programme will be off. You can save the rates now and enable it later.</p>}
    </section>
  </form>;
}
import { updateLoyaltySettingsAction } from '@/app/actions/settings';
