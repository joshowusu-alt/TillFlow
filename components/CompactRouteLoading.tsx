type CompactRouteLoadingProps = {
  variant:
    | 'inventory'
    | 'sales'
    | 'purchases'
    | 'reports'
    | 'report-detail'
    | 'expenses'
    | 'products'
    | 'shifts'
    | 'settings'
    | 'people'
    | 'people-hub'
    | 'list'
    | 'product-form'
    | 'purchase-detail'
    | 'online-orders'
    | 'payments';
};

const ARIA_LABEL: Record<CompactRouteLoadingProps['variant'], string> = {
  inventory: 'Loading inventory',
  sales: 'Loading sales',
  purchases: 'Loading purchases',
  reports: 'Loading reports',
  'report-detail': 'Loading report',
  expenses: 'Loading expenses',
  products: 'Loading products',
  shifts: 'Loading shifts',
  settings: 'Loading settings',
  people: 'Loading people',
  'people-hub': 'Loading people',
  list: 'Loading list',
  'product-form': 'Loading product form',
  'purchase-detail': 'Loading purchase',
  'online-orders': 'Loading online orders',
  payments: 'Loading payments',
};

function PageHeaderPlaceholder({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="h-7 w-36 max-w-[70%] rounded-xl bg-black/5" />
      {subtitle ? <div className="h-3.5 w-52 max-w-full rounded bg-black/5" /> : null}
    </div>
  );
}

function FilterBarPlaceholder({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-black/5 bg-white/90 px-3 shadow-sm ${
        tall ? 'py-3' : 'py-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-24 rounded-xl bg-black/5" />
        <div className="h-8 w-28 rounded-xl bg-black/5" />
        <div className="h-8 flex-1 min-w-[8rem] rounded-xl bg-black/5" />
      </div>
    </div>
  );
}

function StatChips({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:max-w-md">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
          <div className="h-2.5 w-14 rounded bg-black/5" />
          <div className="mt-2 h-5 w-16 rounded-lg bg-black/5" />
        </div>
      ))}
    </div>
  );
}

function ListRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-black/5 bg-white px-3 py-3 sm:px-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-black/5" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 max-w-[12rem] rounded bg-black/5" />
              <div className="h-3 w-1/3 max-w-[8rem] rounded bg-black/5" />
            </div>
            <div className="hidden h-3 w-12 rounded bg-black/5 sm:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white p-3">
          <div className="flex gap-3">
            <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-black/5" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-black/5" />
              <div className="h-3 w-1/2 rounded bg-black/5" />
              <div className="h-3 w-1/3 rounded bg-black/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="h-8 w-8 rounded-xl bg-black/5" />
          <div className="mt-3 h-4 w-2/3 rounded bg-black/5" />
          <div className="mt-2 h-3 w-full rounded bg-black/5" />
        </div>
      ))}
    </div>
  );
}

function FormPanelPlaceholder() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/90 p-4 shadow-sm">
      <div className="h-4 w-28 rounded bg-black/5" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="h-10 rounded-xl bg-black/5" />
        <div className="h-10 rounded-xl bg-black/5" />
        <div className="h-10 rounded-xl bg-black/5 sm:col-span-2" />
      </div>
      <div className="mt-3 h-10 w-28 rounded-xl bg-black/5" />
    </div>
  );
}

/**
 * Compact, mobile-first route skeletons for protected in-app navigation.
 * Variants follow live page geometry; they are not one generic table.
 */
export default function CompactRouteLoading({ variant }: CompactRouteLoadingProps) {
  return (
    <div
      className="space-y-4 animate-pulse motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-label={ARIA_LABEL[variant]}
      data-route-skeleton={variant}
    >
      <PageHeaderPlaceholder />

      {variant === 'inventory' ? (
        <>
          <StatChips count={2} />
          <FilterBarPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'sales' ? (
        <>
          <FilterBarPlaceholder tall />
          <ListRows count={6} />
        </>
      ) : null}

      {variant === 'purchases' ? (
        <>
          <div className="h-11 w-36 rounded-xl bg-black/5" />
          <FilterBarPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'reports' ? <ReportCards count={6} /> : null}

      {variant === 'report-detail' ? (
        <>
          <div className="rounded-2xl border border-black/5 bg-white/90 p-3 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="h-10 rounded-xl bg-black/5" />
              <div className="h-10 rounded-xl bg-black/5" />
              <div className="h-10 rounded-xl bg-black/5" />
            </div>
            <div className="mt-2 h-10 w-28 rounded-xl bg-black/5" />
          </div>
          <StatChips count={4} />
          <ListRows count={6} />
        </>
      ) : null}

      {variant === 'expenses' ? (
        <>
          <FormPanelPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'products' ? (
        <>
          <StatChips count={3} />
          <FilterBarPlaceholder />
          <ProductCards count={6} />
        </>
      ) : null}

      {variant === 'shifts' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="h-10 w-28 rounded-xl bg-black/5" />
            <div className="h-10 w-28 rounded-xl bg-black/5" />
          </div>
          <FormPanelPlaceholder />
          <ListRows count={4} />
        </>
      ) : null}

      {variant === 'settings' ? (
        <>
          <FormPanelPlaceholder />
          <FormPanelPlaceholder />
        </>
      ) : null}

      {variant === 'people' || variant === 'list' ? (
        <>
          <FilterBarPlaceholder />
          <ListRows count={6} />
        </>
      ) : null}

      {variant === 'people-hub' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="h-8 w-8 rounded-xl bg-black/5" />
              <div className="mt-3 h-4 w-2/3 rounded bg-black/5" />
              <div className="mt-2 h-3 w-full rounded bg-black/5" />
              <div className="mt-4 h-10 w-36 rounded-xl bg-black/5" />
            </div>
          ))}
        </div>
      ) : null}

      {variant === 'product-form' ? (
        <>
          <div className="h-40 w-full rounded-2xl bg-black/5 sm:max-w-sm" />
          <FormPanelPlaceholder />
          <FormPanelPlaceholder />
        </>
      ) : null}

      {variant === 'purchase-detail' ? (
        <>
          <StatChips count={3} />
          <ListRows count={4} />
          <FormPanelPlaceholder />
        </>
      ) : null}

      {variant === 'online-orders' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 w-24 rounded-full bg-black/5" />
            ))}
          </div>
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'payments' ? (
        <>
          <FilterBarPlaceholder />
          <FormPanelPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}
    </div>
  );
}
