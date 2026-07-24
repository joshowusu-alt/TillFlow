/**
 * Mobile header chip label for reporting/operational scope.
 *
 * Home (`/onboarding`) always reports business-wide KPIs ("Today · All branches").
 * The chip must not show the operational store name there — that previously made
 * "Main Branch" appear beside "All branches" on the same screen.
 *
 * Off Home, when the business-wide today-sales pulse is showing, the chip also
 * says "All branches". Otherwise it shows the user's operational store identity.
 */
export function mobileReportingScopeLabel(input: {
  pathname: string;
  storeName?: string | null;
  showingBusinessWideSalesPulse: boolean;
}): string {
  const path = input.pathname || '';
  const isHome = path === '/onboarding' || path.startsWith('/onboarding/');
  if (isHome || input.showingBusinessWideSalesPulse) {
    return 'All branches';
  }
  const name = input.storeName?.trim();
  return name || 'Main branch';
}
