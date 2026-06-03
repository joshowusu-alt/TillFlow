'use client';

import { formatMoney } from '@/lib/format';

type LoyaltyRedemptionPanelProps = {
  currency: string;
  pointsBalance: number;
  pointsInput: string;
  maxPoints: number;
  pointsToRedeem: number;
  discountPence: number;
  pesewasPerHundredPoints: number;
  onPointsInputChange: (value: string) => void;
  onApplyMax: () => void;
};

export default function LoyaltyRedemptionPanel({
  currency,
  pointsBalance,
  pointsInput,
  maxPoints,
  pointsToRedeem,
  discountPence,
  pesewasPerHundredPoints,
  onPointsInputChange,
  onApplyMax,
}: LoyaltyRedemptionPanelProps) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800/70">
            Loyalty redemption
          </div>
          <p className="mt-1 text-sm text-emerald-900">
            Balance: <strong>{pointsBalance.toLocaleString()}</strong> points
          </p>
        </div>
        {maxPoints > 0 ? (
          <button type="button" className="btn-secondary text-xs" onClick={onApplyMax}>
            Use max ({maxPoints.toLocaleString()})
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label text-emerald-900">Points to redeem</label>
          <input
            className="input"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={pointsInput}
            onChange={(e) => onPointsInputChange(e.target.value)}
            placeholder="e.g. 500"
          />
          <p className="mt-1 text-xs text-emerald-800/80">
            Redeemed in blocks of 100 points ({formatMoney(pesewasPerHundredPoints, currency)} per 100).
          </p>
        </div>
        {pointsToRedeem > 0 ? (
          <div className="rounded-xl bg-white/90 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span className="font-semibold">-{formatMoney(discountPence, currency)}</span>
            <span className="text-emerald-800/70"> ({pointsToRedeem.toLocaleString()} pts)</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
