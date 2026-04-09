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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center justify-center px-4 py-4 sm:px-6 sm:py-10 lg:px-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="panel overflow-hidden p-5 sm:p-10">
          <div className="eyebrow">Internal control plane</div>
          <h1 className="page-title mt-4 font-[var(--font-display)] text-control-ink">Tish Group Control keeps billing decisions in one place and pushes the result back into Tillflow.</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-black/64">
            Staff sign in here to manage subscriptions, record payments, capture internal notes, and restore or restrict access across the managed Tillflow portfolio.
          </p>

          <div className="mobile-nav-strip mt-5 -mx-1 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <span className="control-chip">Subscriptions</span>
            <span className="control-chip">Collections</span>
            <span className="control-chip">Revenue risk</span>
            <span className="control-chip">Recovery</span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
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

        <section className="panel p-5 sm:p-10">
          <div className="eyebrow">Staff sign-in</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-control-ink">Access Tish Group Control</h2>
          <p className="mt-3 text-sm leading-6 text-black/64">
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

          <form action={loginControlStaffAction} className="mt-6 space-y-4">
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
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#122126] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d1a1e]"
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