import type { BusinessPlan } from '@/lib/features';
import type { DenialReason, ResolvedScope, SurfaceSpec } from '@/lib/entitlements/types';
import {
  CONSOLIDATED_LABEL,
  STOREFRONT_LABEL,
  WHOLE_BUSINESS_LABEL,
} from '@/lib/entitlements/types';

export type ScopeInput = {
  requestedStoreId?: string | null;
  ownedStoreIds?: readonly string[];
  operationalStoreId?: string | null;
  recordStoreId?: string | null;
};

export type ScopeResolution =
  | { ok: true; scope: ResolvedScope }
  | { ok: false; reason: DenialReason };

function isSupplied(value: string | null | undefined): value is string {
  return value !== undefined && value !== null;
}

/**
 * E.0–E.3. Denial order inside this step is B.6 items 12–15:
 * invalid, then consolidated forbidden, then not operational, then unselected.
 */
export function resolveSurfaceScope(
  spec: SurfaceSpec,
  plan: BusinessPlan,
  scope: ScopeInput,
): ScopeResolution {
  if (
    spec.scopeClass === 'FIXED_CONSOLIDATED' ||
    spec.scopeClass === 'ACCOUNTING_WHOLE_BUSINESS' ||
    spec.scopeClass === 'STOREFRONT_DOMAIN'
  ) {
    if (isSupplied(scope.requestedStoreId)) {
      return { ok: false, reason: 'SCOPE_STORE_INVALID' };
    }
    if (spec.scopeClass === 'FIXED_CONSOLIDATED') {
      return { ok: true, scope: { class: 'FIXED_CONSOLIDATED', label: CONSOLIDATED_LABEL } };
    }
    if (spec.scopeClass === 'ACCOUNTING_WHOLE_BUSINESS') {
      return { ok: true, scope: { class: 'ACCOUNTING_WHOLE_BUSINESS', label: WHOLE_BUSINESS_LABEL } };
    }
    return { ok: true, scope: { class: 'STOREFRONT_DOMAIN', label: STOREFRONT_LABEL } };
  }

  if (spec.scopeClass === 'NONE') {
    return { ok: true, scope: { class: 'NONE' } };
  }
  if (spec.scopeClass === 'PER_MEMBER') {
    return { ok: true, scope: { class: 'PER_MEMBER' } };
  }
  if (spec.scopeClass === 'TENANT_CATALOG') {
    return { ok: true, scope: { class: 'TENANT_CATALOG' } };
  }
  if (spec.scopeClass === 'TENANT_ADMIN') {
    return { ok: true, scope: { class: 'TENANT_ADMIN' } };
  }
  if (spec.scopeClass === 'TENANT_RECORD') {
    return resolveTenantRecord(scope);
  }

  if (spec.scopeClass !== 'STORE_DIMENSIONAL') {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }

  return resolveStoreDimensional(spec, plan, scope);
}

function resolveTenantRecord(scope: ScopeInput): ScopeResolution {
  const owned = ownedSet(scope.ownedStoreIds);
  if (isSupplied(scope.recordStoreId)) {
    if (scope.recordStoreId === '' || !owned.has(scope.recordStoreId)) {
      return { ok: false, reason: 'SCOPE_STORE_INVALID' };
    }
    return { ok: true, scope: { class: 'TENANT_RECORD', storeId: scope.recordStoreId } };
  }
  return { ok: true, scope: { class: 'TENANT_RECORD', storeId: null } };
}

function resolveStoreDimensional(
  spec: Extract<SurfaceSpec, { scopeClass: 'STORE_DIMENSIONAL' }>,
  plan: BusinessPlan,
  scope: ScopeInput,
): ScopeResolution {
  const owned = ownedSet(scope.ownedStoreIds);
  const requested = scope.requestedStoreId;
  const supplied = isSupplied(requested);
  const consolidationAllowed = plan === 'PRO' && spec.consolidationSupported;

  if (isSupplied(scope.operationalStoreId) && (scope.operationalStoreId === '' || !owned.has(scope.operationalStoreId))) {
    return { ok: false, reason: 'SCOPE_STORE_INVALID' };
  }

  const operational = resolveOperationalId(owned, scope.operationalStoreId);

  if (supplied && (requested === '' || (requested !== 'ALL' && !owned.has(requested)))) {
    return { ok: false, reason: 'SCOPE_STORE_INVALID' };
  }

  if (supplied && requested === 'ALL' && !consolidationAllowed) {
    return { ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' };
  }

  if (supplied && requested !== 'ALL' && !consolidationAllowed && requested !== operational) {
    return { ok: false, reason: 'SCOPE_STORE_NOT_OPERATIONAL' };
  }

  if (supplied && requested === 'ALL' && consolidationAllowed) {
    if (owned.size === 1) {
      const only = [...owned][0];
      return { ok: true, scope: { class: 'STORE_DIMENSIONAL', mode: 'STORE', storeId: only } };
    }
    if (owned.size === 0) {
      return { ok: false, reason: 'SCOPE_STORE_UNSELECTED' };
    }
    return { ok: true, scope: { class: 'STORE_DIMENSIONAL', mode: 'ALL' } };
  }

  if (supplied && consolidationAllowed) {
    return { ok: true, scope: { class: 'STORE_DIMENSIONAL', mode: 'STORE', storeId: requested } };
  }

  if (!operational) {
    return { ok: false, reason: 'SCOPE_STORE_UNSELECTED' };
  }
  return { ok: true, scope: { class: 'STORE_DIMENSIONAL', mode: 'STORE', storeId: operational } };
}

function resolveOperationalId(
  owned: ReadonlySet<string>,
  operationalStoreId: string | null | undefined,
): string | null {
  if (isSupplied(operationalStoreId) && operationalStoreId !== '' && owned.has(operationalStoreId)) {
    return operationalStoreId;
  }
  if (owned.size === 1) {
    return [...owned][0];
  }
  return null;
}

function ownedSet(ids: readonly string[] | undefined): Set<string> {
  return new Set(ids ?? []);
}
