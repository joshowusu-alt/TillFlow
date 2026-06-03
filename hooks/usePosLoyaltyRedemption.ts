'use client';

import { useMemo, useState } from 'react';

import {
  clampLoyaltyRedemption,
  type LoyaltyBusinessSettings,
} from '@/lib/loyalty';

type UsePosLoyaltyRedemptionOptions = {
  enabled: boolean;
  settings: LoyaltyBusinessSettings;
  customerId: string;
  pointsBalance: number;
  netSubtotalPence: number;
};

export function usePosLoyaltyRedemption({
  enabled,
  settings,
  customerId,
  pointsBalance,
  netSubtotalPence,
}: UsePosLoyaltyRedemptionOptions) {
  const [pointsInput, setPointsInput] = useState('');

  const active = enabled && !!customerId && settings.loyaltyEnabled;

  const parsedPoints = useMemo(() => {
    const raw = pointsInput.trim();
    if (!raw) return 0;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [pointsInput]);

  const redemption = useMemo(() => {
    if (!active) {
      return { pointsRedeemed: 0, discountPence: 0 };
    }
    return clampLoyaltyRedemption({
      pointsToRedeem: parsedPoints,
      balance: pointsBalance,
      netSubtotalPence,
      settings,
    });
  }, [active, parsedPoints, pointsBalance, netSubtotalPence, settings]);

  const maxPoints = useMemo(() => {
    if (!active) return 0;
    return clampLoyaltyRedemption({
      pointsToRedeem: pointsBalance,
      balance: pointsBalance,
      netSubtotalPence,
      settings,
    }).pointsRedeemed;
  }, [active, pointsBalance, netSubtotalPence, settings]);

  const reset = () => setPointsInput('');

  const applyMax = () => {
    if (maxPoints > 0) setPointsInput(String(maxPoints));
  };

  return {
    active,
    pointsInput,
    setPointsInput,
    pointsToRedeem: redemption.pointsRedeemed,
    loyaltyDiscountPence: redemption.discountPence,
    maxPoints,
    applyMax,
    reset,
  };
}
