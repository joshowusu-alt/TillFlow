import { redirect } from 'next/navigation';

import { requireBusiness, type Role } from '@/lib/auth';
import { getFeatures } from '@/lib/features';

const BLOCKED_PATH = '/settings/notifications';

export async function requireDailySummaryAccess(roles: Role[] = ['OWNER']) {
  const ctx = await requireBusiness(roles);
  const { business } = ctx;
  if (!business) {
    redirect('/login');
  }

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );

  if (!features.advancedOps) {
    redirect(
      `${BLOCKED_PATH}?error=${encodeURIComponent('Daily Owner Summary is available on Growth and Pro.')}`,
    );
  }

  return ctx;
}

export function assertDailySummaryFeatureFromSnapshot(business: {
  plan?: string | null;
  mode?: string | null;
  storeMode?: string | null;
}) {
  const features = getFeatures(
    (business.plan ?? business.mode) as any,
    (business.storeMode as any) ?? 'SINGLE_STORE',
  );
  return features.advancedOps;
}
