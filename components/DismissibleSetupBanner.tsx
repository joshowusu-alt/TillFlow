'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import {
  isSetupBannerDismissed,
  SETUP_BANNER_DISMISS_EVENT,
} from '@/lib/navigation/nav-kpi-events';

/**
 * Hides the owner setup banner as soon as POS records a successful sale.
 * The protected layout only drops the banner after a fresh server render, and
 * that refresh does not always commit on the Postgres preview.
 */
export default function DismissibleSetupBanner({
  businessId,
  children,
}: {
  businessId: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);

  useLayoutEffect(() => {
    if (isSetupBannerDismissed(businessId)) setHidden(true);

    const onDismiss = (event: Event) => {
      const detail = (event as CustomEvent<{ businessId?: string }>).detail;
      if (!detail?.businessId || detail.businessId === businessId) setHidden(true);
    };

    window.addEventListener(SETUP_BANNER_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(SETUP_BANNER_DISMISS_EVENT, onDismiss);
  }, [businessId]);

  if (hidden) return null;
  return <>{children}</>;
}
