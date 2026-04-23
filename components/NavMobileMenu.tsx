'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { getFeatures, hasPlanAccess, type BusinessPlan } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import InstallButton from './InstallButton';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { TopNavUser } from './TopNav';

interface NavMobileMenuProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  visibleGroups: Array<{
    id: string;
    label: string;
    items: Array<{ href: string; label: string; roles: string[] }>;
  }>;
  isOnline: boolean;
  user: TopNavUser;
  storeName?: string;
  features: ReturnType<typeof getFeatures>;
  pathname: string;
  planGatedLinks: Map<string, BusinessPlan>;
  todaySales?: { totalPence: number; txCount: number; currency: string };
}

export default function NavMobileMenu({
  mobileOpen,
  setMobileOpen,
  visibleGroups,
  isOnline,
  user,
  storeName,
  features,
  pathname,
  planGatedLinks,
  todaySales,
}: NavMobileMenuProps) {
  useBodyScrollLock(mobileOpen);

  useEffect(() => {
    if (!mobileOpen) return;

    const closeMenu = () => setMobileOpen(false);
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileOpen(false);
      }
    };

    window.addEventListener('orientationchange', closeMenu);
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('orientationchange', closeMenu);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, [mobileOpen, setMobileOpen]);

  if (!mobileOpen) return null;

  function getNavIcon(href: string): React.ReactNode {
    const cls = 'h-4 w-4 flex-shrink-0 text-black/40';
    const props = { className: cls, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5 } as const;
    const p = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (href) {
      case '/pos': return <svg {...props}><path {...p} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6H2.25M3.75 4.5h16.5M3.75 4.5H3m16.5 0v.75a.75.75 0 00.75.75H21m-1.5-1.5H21M21 6h-.75M3 6h.75m0 0v13.5m16.5-13.5v13.5M9 9.75h6M9 12.75h6M9 15.75h3" /></svg>;
      case '/sales': return <svg {...props}><path {...p} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75m0-3.75h.008v.008H12V18z" /></svg>;
      case '/shifts': return <svg {...props}><path {...p} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
      case '/inventory': return <svg {...props}><path {...p} d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" /></svg>;
      case '/inventory/adjustments': return <svg {...props}><path {...p} d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>;
      case '/reports/stock-movements': return <svg {...props}><path {...p} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>;
      case '/purchases': return <svg {...props}><path {...p} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>;
      case '/transfers': return <svg {...props}><path {...p} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>;
      case '/products': return <svg {...props}><path {...p} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>;
      case '/products/labels': return <svg {...props}><path {...p} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path {...p} d="M6 6h.008v.008H6V6z" /></svg>;
      case '/expenses': return <svg {...props}><path {...p} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>;
      case '/payments/customer-receipts': return <svg {...props}><path {...p} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
      case '/payments/supplier-payments': return <svg {...props}><path {...p} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>;
      case '/payments/reconciliation': return <svg {...props}><path {...p} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>;
      case '/payments/reconciliation/card-transfer': return <svg {...props}><path {...p} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>;
      case '/customers': return <svg {...props}><path {...p} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
      case '/suppliers': return <svg {...props}><path {...p} d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016 2.993 2.993 0 002.25-1.016 3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" /></svg>;
      case '/reports/command-center': return <svg {...props}><path {...p} d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
      case '/reports/dashboard': return <svg {...props}><path {...p} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
      case '/reports/analytics': return <svg {...props}><path {...p} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
      case '/reports/margins': return <svg {...props}><path {...p} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>;
      case '/reports/reorder-suggestions': return <svg {...props}><path {...p} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>;
      case '/reports/income-statement': return <svg {...props}><path {...p} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
      case '/reports/balance-sheet': return <svg {...props}><path {...p} d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.589-1.202L18.75 4.97zm-16.5 0c-.99.143-1.99.317-3 .52m3-.52L5.63 15.696c-.122.499.106 1.028.589 1.202a5.989 5.989 0 002.031.352 5.989 5.989 0 002.031-.352c.483-.174.711-.703.589-1.202L5.25 4.97z" /></svg>;
      case '/reports/cashflow': return <svg {...props}><path {...p} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6H2.25M3.75 4.5h16.5m-16.5 0H3m16.5 0h.75m-16.5.75v8.25m16.5-8.25v8.25M3 6h.75m16.5-1.5H21" /></svg>;
      case '/reports/exports': return <svg {...props}><path {...p} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
      case '/reports/cash-drawer': return <svg {...props}><path {...p} d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512A2.25 2.25 0 0117.89 13.5h3.86M2.25 13.5V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v6.75M2.25 13.5v3.75A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V13.5" /></svg>;
      case '/reports/risk-monitor': return <svg {...props}><path {...p} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>;
      case '/reports/owner': return <svg {...props}><path {...p} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path {...p} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
      case '/reports/cashflow-forecast': return <svg {...props}><path {...p} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
      case '/reports/audit-log': return <svg {...props}><path {...p} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" /></svg>;
      case '/account': return <svg {...props}><path {...p} d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
      case '/settings': return <svg {...props}><path {...p} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path {...p} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
      case 'users':
      case '/users': return <svg {...props}><path {...p} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>;
      case '/onboarding': return <svg {...props}><path {...p} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>;
      default: return <svg {...props}><path {...p} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>;
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} />
      <div className="nav-mobile-panel fixed z-50 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-floating backdrop-blur-xl lg:hidden">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={isOnline ? 'status-dot-online' : 'status-dot-offline'} />
                  <span className="truncate text-base font-semibold text-ink">{user.name}</span>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-muted">
                  {user.role}{storeName ? ` · ${storeName}` : ''}
                </div>
              </div>
              <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="metric-chip">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                Navigation
              </div>
              <InstallButton />
            </div>
            {(user.role === 'MANAGER' || user.role === 'OWNER') && todaySales ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Today sales</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(todaySales.totalPence, todaySales.currency)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Transactions</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-ink">{todaySales.txCount}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="space-y-1">
              {visibleGroups.map((group, groupIndex) => (
                <section key={group.id}>
                  {groupIndex > 0 && <hr className="my-1 -mx-4 border-gray-100" />}
                  <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">{group.label}</div>
                  <div className="grid gap-1.5">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + '/');
                      const minimumPlan = planGatedLinks.get(item.href);
                      const planLocked = minimumPlan ? !hasPlanAccess(features.plan, minimumPlan) : false;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={active ? 'shell-nav-link shell-nav-link-active border border-blue-100' : 'shell-nav-link border border-slate-200/70 bg-white'}
                          onClick={() => setMobileOpen(false)}
                        >
                          <span className="flex items-center gap-2.5">
                            {getNavIcon(item.href)}
                            {item.label}
                          </span>
                          {planLocked && minimumPlan ? (
                            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-black/50">
                              {minimumPlan}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-slate-50/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <form action={logout}>
              <button type="submit" className="btn-ghost w-full text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
