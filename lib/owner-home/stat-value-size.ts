/**
 * Pure helper for sizing Home hero stat values by string length.
 *
 * Deliberately NOT in a 'use client' module: `HomePerformanceSlot` is an
 * async Server Component and calls this directly during render. A plain
 * function exported from a 'use client' file (as this used to live in
 * `components/owner-home/home-chrome.tsx`) becomes a client reference when
 * imported into a Server Component — calling it there throws
 * "<name> is not a function" in production builds, which is what caused
 * "Could not load today's figures" on every load, regardless of the
 * underlying sales data.
 */
export function getStatValueSize(value: string, primary: boolean) {
  if (value.length > 11) return primary ? 'text-sm sm:text-sm lg:text-base' : 'text-xs sm:text-sm lg:text-base';
  if (value.length > 8) return primary ? 'text-base sm:text-lg lg:text-lg' : 'text-sm lg:text-lg';
  return primary ? 'text-xl sm:text-2xl lg:text-2xl' : 'text-base sm:text-lg lg:text-2xl';
}
