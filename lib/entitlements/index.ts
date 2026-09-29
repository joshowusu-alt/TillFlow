export {
  authorizeCronSurface,
  guardSurfaceRoute,
  requireSurface,
  toPageAccess,
  toRouteAccess,
  withSurfaceAction,
} from '@/lib/entitlements/adapters';
export { decideBusinessCapability, decideSurfaceAccess } from '@/lib/entitlements/decide';
export { resolveCanonicalPlan } from '@/lib/entitlements/plan';
export {
  addCalendarDays,
  clampHrefFor,
  earliestPermittedLocalDate,
  inclusiveLocalDateCount,
  resolveAnalyticalRange,
  todayLocalDate,
} from '@/lib/entitlements/range';
export { STARTER_SALES_COLUMN_EXCLUSIONS, SURFACE_CATALOGUE, SURFACE_IDS } from '@/lib/entitlements/surface-catalogue';
export type { SurfaceId } from '@/lib/entitlements/surface-catalogue';
export {
  BILLING_CLASS,
  BUSINESS_CAPABILITY,
  CONSOLIDATED_LABEL,
  DENIAL_REASONS,
  DENIAL_ROUTE_STATUS,
  FEATURE_FLAGS,
  ROLES,
  SCOPE_CLASSES,
  STOREFRONT_LABEL,
  SURFACE_ACTIONS,
  WHOLE_BUSINESS_LABEL,
} from '@/lib/entitlements/types';
export type {
  AllowDecision,
  AppliedRange,
  BusinessCapability,
  BusinessCapabilityInput,
  CapabilityDecision,
  Decision,
  DenialReason,
  DenyDecision,
  EntitlementActor,
  FeatureFlag,
  ResolvedScope,
  Role,
  ScopeClass,
  SurfaceAccessInput,
  SurfaceAction,
  SurfaceSpec,
} from '@/lib/entitlements/types';
