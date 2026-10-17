/** A business address can identify a single pickup branch, but cannot identify an unspecified branch of a chain. */
export function resolveStorefrontPickupAddress(branchAddress: string | null | undefined, businessAddress: string | null | undefined, storeCount: number): string | null {
  return branchAddress?.trim() || (storeCount === 1 ? businessAddress?.trim() || null : null);
}
