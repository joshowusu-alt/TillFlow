import PosBoardSkeleton from './PosBoardSkeleton';

/**
 * Single non-branded POS-shaped route loader — same shape as the page Suspense
 * fallback. No TillFlow splash chip / logo stage during in-app navigation.
 */
export default function Loading() {
  return <PosBoardSkeleton />;
}
