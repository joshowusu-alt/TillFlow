import { redirect } from 'next/navigation';
import { loginControlStaffAction } from '@/app/actions/control-auth';
import { controlAuthConfigured, getControlStaffOptional } from '@/lib/control-auth';

export const dynamic = 'force-dynamic';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const staff = await getControlStaffOptional();
  if (staff) {
    redirect('/');
  }

  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;

  const error = readSearchParam(resolvedSearchParams.error);
  const authConfigured = controlAuthConfigured();

  return (
    <div className="login-page-shell mx-auto flex min-h-[100dvh] w-full max-w-6xl items-start justify-center px-3.5 pb-[calc(var(--safe-bottom)+1rem)] pt-[calc(var(--safe-top)+0.75rem)] sm:px-6 sm:py-10 lg:items-center lg:px-8">
      <div className="grid w-full max-w-5xl gap-3.5 sm:gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="panel order-2 overflow-hidden p-4 sm:p-8 lg:order-1 lg:p-10">
          <div className="eyebrow">Internal control plane</div>
          <h1 className="page-title mt-4 font-[var(--font-display)] text-control-ink">Tish Group Control keeps billing decisions in one place and pushes the result back into Tillflow.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/64 sm:mt-5 sm:text-base sm:leading-8">
            Staff sign in here to manage subscriptions, record payments, capture internal notes, and restore or restrict access across the managed Tillflow portfolio.
          </p>

          <div className="mobile-nav-strip mt-4 -mx-1 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <span className="control-chip">Subscriptions</span>
            <span className="control-chip">Collections</span>
            <span className="control-chip">Revenue risk</span>
            <span className="control-chip">Recovery</span>
          </div>

          <div className="mt-5 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
            <div className="control-stat-card">
              <div className="eyebrow">Source of truth</div>
              <p className="mt-2 text-sm leading-6 text-black/64">Commercial changes are written here first, then mirrored into Tillflow entitlement fields.</p>
            </div>
            <div className="control-stat-card">
              <div className="eyebrow">Staff roles</div>
              <p className="mt-2 text-sm leading-6 text-black/64">Access is tied to Control staff records so account managers and collections operators do not share one generic login.</p>
            </div>
            <div className="control-stat-card">
              <div className="eyebrow">Immediate recovery</div>
              <p className="mt-2 text-sm leading-6 text-black/64">When payment is recorded here, Tillflow writes are restored immediately according to the sold plan.</p>
            </div>
          </div>
        </section>

        <section className="panel order-1 p-4 sm:p-8 lg:order-2 lg:p-10">
          <div className="eyebrow">Staff sign-in</div>
          <h2 className="mt-2.5 text-[1.65rem] font-semibold leading-tight tracking-tight text-control-ink sm:mt-3 sm:text-2xl">Access Tish Group Control</h2>
          <p className="mt-2.5 text-sm leading-6 text-black/64 sm:mt-3">
            Use your Control staff email plus the shared internal access key. For the first bootstrap login, set CONTROL_BOOTSTRAP_ADMIN_EMAIL to your email.
          </p>

          {!authConfigured ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              CONTROL_PLANE_ACCESS_KEY is not configured. Add it to the environment before using this app.
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          <form action={loginControlStaffAction} className="mt-5 space-y-4 sm:mt-6">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Staff email</span>
              <input
                type="email"
                name="email"
                placeholder="you@tishgroup.com"
                className="control-field"
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Internal access key</span>
              <input
                type="password"
                name="accessKey"
                className="control-field"
                autoComplete="current-password"
                required
              />
            </label>

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-[#122126] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d1a1e]"
            >
              Sign in to Control
            </button>
          </form>

          <div className="mt-5 rounded-[22px] border border-black/8 bg-black/[0.02] px-4 py-4 text-sm text-black/60">
            Best on phone: sign in once, install the app, and work the portfolio from the bottom navigation and queue shortcuts.
          </div>
        </section>
      </div>
    </div>
  );
}
