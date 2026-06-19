import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

const actionCards = [
  {
    title: 'Customers',
    description: 'Manage customer records, balances, tags, and payment history.',
    href: '/customers',
    cta: 'View customers',
    accent: 'bg-blue-50 text-blue-700 ring-blue-100',
    icon: 'customers',
  },
  {
    title: 'Suppliers',
    description: 'Track suppliers, purchase history, linked products, and payables.',
    href: '/suppliers',
    cta: 'View suppliers',
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    icon: 'suppliers',
  },
  {
    title: 'Customer payments',
    description: 'Record debt payments and keep customer balances current.',
    href: '/payments/customer-receipts',
    cta: 'Record customer payment',
    accent: 'bg-amber-50 text-amber-700 ring-amber-100',
    icon: 'receipt',
  },
  {
    title: 'Supplier payments',
    description: 'Record payments made to suppliers and reduce outstanding payables.',
    href: '/payments/supplier-payments',
    cta: 'Record supplier payment',
    accent: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    icon: 'payment',
  },
] as const;

const summaryCards = [
  {
    label: 'Customer records',
    body: 'Credit accounts, contacts, tags, and payment history.',
    href: '/customers',
  },
  {
    label: 'Supplier records',
    body: 'Vendors, linked products, purchases, and payment status.',
    href: '/suppliers',
  },
  {
    label: 'Receipts',
    body: 'Customer debt payments recorded against outstanding balances.',
    href: '/payments/customer-receipts',
  },
  {
    label: 'Payables',
    body: 'Supplier amounts owed and payments made from the business.',
    href: '/payments/supplier-payments',
  },
] as const;

function ModuleIcon({ name }: { name: (typeof actionCards)[number]['icon'] }) {
  const shared = {
    className: 'h-5 w-5',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.8,
  } as const;
  const pathProps = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (name === 'customers') {
    return (
      <svg {...shared} aria-hidden="true">
        <path {...pathProps} d="M15 19.13a9.34 9.34 0 0 0 2.63.37 9.34 9.34 0 0 0 4.12-.95 4.13 4.13 0 0 0-7.54-2.5" />
        <path {...pathProps} d="M15 19.13v.1A12.32 12.32 0 0 1 8.62 21a12.32 12.32 0 0 1-6.37-1.77v-.1a6.38 6.38 0 0 1 11.96-3.07" />
        <path {...pathProps} d="M12 6.38a3.38 3.38 0 1 1-6.75 0 3.38 3.38 0 0 1 6.75 0Z" />
        <path {...pathProps} d="M20.25 8.63a2.63 2.63 0 1 1-5.25 0 2.63 2.63 0 0 1 5.25 0Z" />
      </svg>
    );
  }

  if (name === 'suppliers') {
    return (
      <svg {...shared} aria-hidden="true">
        <path {...pathProps} d="M3.75 21V9.35m16.5 11.65V9.35" />
        <path {...pathProps} d="M3.75 9.35a3 3 0 0 1-.62-4.72l1.19-1.19A1.5 1.5 0 0 1 5.38 3h13.24a1.5 1.5 0 0 1 1.06.44l1.19 1.19a3 3 0 0 1-.62 4.72 3 3 0 0 1-3.75-.62 3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0 3 3 0 0 1-3.75.62Z" />
        <path {...pathProps} d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21" />
        <path {...pathProps} d="M6 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21" />
      </svg>
    );
  }

  if (name === 'receipt') {
    return (
      <svg {...shared} aria-hidden="true">
        <path {...pathProps} d="M19.5 14.25v-2.63A3.38 3.38 0 0 0 16.13 8.25h-1.5A1.13 1.13 0 0 1 13.5 7.13v-1.5A3.38 3.38 0 0 0 10.13 2.25H5.63A1.13 1.13 0 0 0 4.5 3.38v17.25c0 .62.5 1.12 1.13 1.12h12.75c.62 0 1.12-.5 1.12-1.12v-6.38Z" />
        <path {...pathProps} d="M8.25 15h7.5M8.25 18H12" />
      </svg>
    );
  }

  return (
    <svg {...shared} aria-hidden="true">
      <path {...pathProps} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25" />
      <path {...pathProps} d="M3 9 12 3l9 6M4.5 21V10.33A48.36 48.36 0 0 1 12 9.75c2.55 0 5.06.2 7.5.58V21" />
      <path {...pathProps} d="M3 21h18M12 6.75h.01" />
    </svg>
  );
}

export default function PeoplePage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="animate-fade-in-up">
        <PageHeader
          title="People"
          subtitle="Manage customers, suppliers, balances, and relationships."
        />
      </div>

      <section className="animate-fade-in-up overflow-hidden rounded-[1.6rem] border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-emerald-50/60 p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 shadow-sm ring-1 ring-blue-100">
              Relationships
            </div>
            <h2 className="mt-4 text-2xl font-display font-semibold tracking-tight text-ink sm:text-3xl">
              Keep every account conversation connected.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
              Customer credit, supplier payables, contacts, and payments stay close together so follow-ups are faster.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[26rem]">
            {summaryCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-2xl border border-white/80 bg-white/90 p-3 text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white hover:shadow-card"
              >
                <div className="font-semibold text-ink">{card.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted">{card.body}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger-children">
        {actionCards.map((card) => (
          <Link key={card.href} href={card.href} className="module-card group">
            <div className="flex items-start justify-between gap-3">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${card.accent}`}>
                <ModuleIcon name={card.icon} />
              </span>
              <span className="module-card-arrow mt-1 text-lg text-blue-700" aria-hidden="true">
                -&gt;
              </span>
            </div>
            <div className="mt-5">
              <h3 className="text-base font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{card.description}</p>
            </div>
            <div className="mt-auto pt-5 text-sm font-semibold text-blue-700">
              {card.cta}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
