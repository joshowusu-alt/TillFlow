import { getFeatures, type BusinessMode, type BusinessPlan, type StoreMode } from '@/lib/features';

/** Match the storefront entitlement and the operational online-order permissions.
 * Cashiers may progress paid orders, but only inside their selected branch.
 * Fail closed if the published-storefront flag is absent from a legacy snapshot.
 */
export function canReceiveOnlineOrderAlerts(
  business: {
    storefrontEnabled?: boolean | null;
    plan?: string | null;
    mode?: string | null;
    storeMode?: string | null;
    addonOnlineStorefront?: boolean | null;
    billingCanWrite: boolean;
  },
  role: string,
  hasStore: boolean,
): boolean {
  return business.storefrontEnabled === true &&
    business.billingCanWrite &&
    getFeatures((business.plan ?? business.mode) as BusinessPlan | BusinessMode | null | undefined, business.storeMode as StoreMode | null | undefined, {
      onlineStorefront: business.addonOnlineStorefront,
    }).onlineStorefront &&
    (role === 'OWNER' || role === 'MANAGER' || (role === 'CASHIER' && hasStore));
}
