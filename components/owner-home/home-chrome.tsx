'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

export type HomeAction = {
  label: string;
  desc: string;
  href: string;
  primary?: boolean;
  urgent?: boolean;
  breakBefore?: boolean;
  icon: React.ReactNode;
};

export function HomeIcon({
  name,
}: {
  name:
    | 'pos'
    | 'chart'
    | 'box'
    | 'settings'
    | 'shift'
    | 'alert'
    | 'reorder'
    | 'payables'
    | 'purchases'
    | 'sales'
    | 'inventory'
    | 'team'
    | 'setup'
    | 'receipt'
    | 'billing'
    | 'health'
    | 'play';
}) {
  const common = {
    className: 'h-5 w-5',
    fill: 'none',
    viewBox: '0 0 24 24',
    strokeWidth: 1.8,
    stroke: 'currentColor',
  };
  const pathProps = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<typeof name, React.ReactNode> = {
    pos: (
      <path
        {...pathProps}
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      />
    ),
    chart: (
      <path
        {...pathProps}
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    ),
    box: (
      <path
        {...pathProps}
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25"
      />
    ),
    settings: (
      <>
        <path
          {...pathProps}
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
        />
        <path {...pathProps} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
    shift: <path {...pathProps} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    alert: (
      <path
        {...pathProps}
        d="M12 9v3.75m0 3.75h.007v.008H12V16.5zm-9.303-.374c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
      />
    ),
    reorder: (
      <path
        {...pathProps}
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z"
      />
    ),
    payables: (
      <path
        {...pathProps}
        d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18"
      />
    ),
    purchases: (
      <path
        {...pathProps}
        d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0h6m5.25 0a1.5 1.5 0 01-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25m0 11.177v-12.135c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v10.51c0 .621.504 1.125 1.125 1.125H5.25"
      />
    ),
    sales: (
      <path
        {...pathProps}
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192A48.424 48.424 0 0012 3.75c-2.088 0-4.131.134-6.124.392C4.745 4.288 3.75 5.245 3.75 6.392V19.5a2.25 2.25 0 002.25 2.25h9.75"
      />
    ),
    receipt: (
      <path
        {...pathProps}
        d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    ),
    inventory: (
      <path
        {...pathProps}
        d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"
      />
    ),
    team: (
      <path
        {...pathProps}
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    ),
    setup: <path {...pathProps} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    billing: (
      <path
        {...pathProps}
        d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
      />
    ),
    health: (
      <path
        {...pathProps}
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    ),
    play: (
      <path
        {...pathProps}
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export function HomeActionCard({
  action,
  className = '',
  compact = false,
}: {
  action: HomeAction;
  className?: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showPending = pending || isPending;
  const isPos = action.href === '/pos' || action.href.startsWith('/pos?');

  useEffect(() => {
    if (!showPending) return;
    const timer = window.setTimeout(() => setPending(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [showPending]);

  return (
    <Link
      href={action.href}
      prefetch={isPos ? true : undefined}
      aria-busy={showPending || undefined}
      data-nav-pending={showPending ? 'true' : undefined}
      onClick={() => {
        setPending(true);
        startTransition(() => undefined);
      }}
      className={`group relative flex items-center gap-4 rounded-2xl px-4 py-4 shadow-sm transition hover:-translate-y-0.5 active:scale-[0.985] ${
        action.primary
          ? 'bg-accent text-white shadow-md shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 lg:bg-gradient-to-r lg:from-accent lg:to-blue-600'
          : action.urgent
            ? 'border border-amber-200 bg-amber-50 text-ink hover:border-amber-300'
            : 'border border-black/[0.06] bg-white text-ink hover:border-black/10 hover:shadow-md'
      } ${compact ? 'px-3.5 py-3.5' : ''} ${showPending ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-transparent' : ''} ${className}`}
    >
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition ${
          action.primary
            ? 'bg-white/20 text-white'
            : action.urgent
              ? 'bg-amber-100 text-amber-700'
              : 'bg-accentSoft text-accent group-hover:bg-accent group-hover:text-white'
        }`}
      >
        {action.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${action.primary ? 'text-white' : 'text-ink'}`}>
          {showPending && isPos ? 'Opening POS…' : action.label}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            action.primary ? 'text-white/65' : action.urgent ? 'text-amber-800/70' : 'text-muted'
          }`}
        >
          {showPending && isPos ? 'Loading sell screen' : action.desc}
        </p>
      </div>
      <svg
        className={`h-4 w-4 flex-shrink-0 transition group-hover:translate-x-0.5 ${
          action.primary ? 'text-white/40' : 'text-black/20 group-hover:text-accent/50'
        } ${showPending ? 'animate-pulse' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}

// getStatValueSize moved to lib/owner-home/stat-value-size.ts — it is a plain
// function called from the Server Component HomePerformanceSlot, and every
// export of a 'use client' module (this file) becomes a client reference,
// which is not callable directly from server-rendered code.
