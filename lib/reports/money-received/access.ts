import type { AppRole } from '@/lib/navigation-config';

export type MoneyReceivedActor = {
  role: AppRole | string;
  businessId: string;
};

export type ResolveMoneyReceivedAccessInput = {
  actor: MoneyReceivedActor | null | undefined;
  /** Never trust caller-supplied businessId for tenancy. */
  requestedBusinessId?: string | null;
  requestedStoreId?: string | null;
  /** Store IDs belonging to the authenticated business. */
  authorisedStoreIds: string[];
};

export type MoneyReceivedAccessResult =
  | {
      ok: true;
      businessId: string;
      branchIds: string[] | null;
      selectedStoreId: 'ALL' | string;
    }
  | {
      ok: false;
      reason:
        | 'UNAUTHENTICATED'
        | 'ROLE_DENIED'
        | 'TENANT_MISMATCH'
        | 'BRANCH_NOT_AUTHORISED';
      status: 401 | 403;
    };

/**
 * Trusted-scope resolution for Money Received surface and export.
 * businessId is always taken from the authenticated actor.
 */
export function resolveMoneyReceivedAccess(
  input: ResolveMoneyReceivedAccessInput,
): MoneyReceivedAccessResult {
  const actor = input.actor;
  if (!actor) {
    return { ok: false, reason: 'UNAUTHENTICATED', status: 401 };
  }
  if (!['OWNER', 'MANAGER'].includes(actor.role)) {
    return { ok: false, reason: 'ROLE_DENIED', status: 403 };
  }
  if (input.requestedBusinessId && input.requestedBusinessId !== actor.businessId) {
    return { ok: false, reason: 'TENANT_MISMATCH', status: 403 };
  }

  const storeParam = input.requestedStoreId ?? 'ALL';
  if (storeParam === 'ALL' || storeParam === '' || storeParam == null) {
    return {
      ok: true,
      businessId: actor.businessId,
      branchIds: null,
      selectedStoreId: 'ALL',
    };
  }

  if (!input.authorisedStoreIds.includes(storeParam)) {
    return { ok: false, reason: 'BRANCH_NOT_AUTHORISED', status: 403 };
  }

  return {
    ok: true,
    businessId: actor.businessId,
    branchIds: [storeParam],
    selectedStoreId: storeParam,
  };
}

/** Deny cross-tenant drill-down source access when row business differs. */
export function assertDrillRowTenant(
  actorBusinessId: string,
  rowBusinessId: string | null | undefined,
): boolean {
  return Boolean(rowBusinessId) && rowBusinessId === actorBusinessId;
}
