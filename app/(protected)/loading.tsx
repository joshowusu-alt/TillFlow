import { headers } from 'next/headers';
import ProtectedRouteLoading from '@/components/ProtectedRouteLoading';
import HomeInstantLoading from './onboarding/HomeInstantLoading';

function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

/**
 * Protected segment fallback. Home must never flash the generic page skeleton
 * before the journey-specific Home Instant Loading UI.
 */
export default async function Loading() {
  const pathname = headers().get('x-pathname') || headers().get('next-url') || '';
  if (isOnboardingPath(pathname)) {
    return <HomeInstantLoading />;
  }
  return <ProtectedRouteLoading />;
}
