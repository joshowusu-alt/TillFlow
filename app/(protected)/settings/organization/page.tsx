import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import MerchantBrandManager from '@/components/MerchantBrandManager';
import { requireBusiness } from '@/lib/auth';
import { ensureOrganizationAndBranches } from '@/lib/services/branches';
import { registerDeviceAction, syncOrganizationModelAction } from '@/app/actions/branches';
import { updateBrandIdentityAction, updateOrganizationSettingsAction } from '@/app/actions/settings';
import { getFeatures, getPlanSummary } from '@/lib/features';
import { formatDateTime } from '@/lib/format';
import { prisma } from '@/lib/prisma';

export default async function OrganizationSettingsPage(
  props: {
    searchParams?: Promise<{ error?: string; saved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const [organization, brandingSnapshot] = await Promise.all([
    ensureOrganizationAndBranches({
      businessId: business.id,
      businessName: business.name,
    }),
    prisma.business.findUnique({
      where: { id: business.id },
      select: {
        logoUrl: true,
        logoWidth: true,
        logoHeight: true,
        brandCompactLogoUrl: true,
        brandCompactLogoWidth: true,
        brandCompactLogoHeight: true,
        brandSquareLogoUrl: true,
        brandSquareLogoWidth: true,
        brandSquareLogoHeight: true,
        brandInitials: true,
        brandPrimaryColor: true,
        brandCompactMode: true,
        brandLogoBackground: true,
        receiptLogoUrl: true,
        storefrontLogoUrl: true,
        storefrontPrimaryColor: true,
        storefrontTagline: true,
      },
    }),
  ]);
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  const planSummary = getPlanSummary(features.plan);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization & Branches"
        subtitle="Manage branch structure, customer sharing, and registered devices."
      />

      <FormError error={searchParams?.error} />

      <nav aria-label="Organization sections" className="flex flex-wrap gap-2">
        {[["operating-model", "Operating model"], ["branches-devices", "Branches & devices"], ["branding", "Brand identity"]].map(([id, label]) => <a key={id} href={'#' + id} className="btn-secondary min-h-11 text-sm">{label}</a>)}
      </nav>
      {searchParams?.saved && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{searchParams.saved === 'brand' ? 'Brand settings saved.' : searchParams.saved === 'device' ? 'Device registered.' : searchParams.saved === 'sync' ? 'Branches refreshed.' : 'Organization settings saved.'}</p>}
      <div className="card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/50">Organization</div>
            <div className="text-lg font-display font-semibold">{organization?.name ?? 'Not configured'}</div>
          </div>
          <form action={syncOrganizationModelAction}>
            <SubmitButton className="btn-secondary text-xs" loadingText="Syncing...">
              Refresh branches
            </SubmitButton>
          </form>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            <div className="text-xs text-black/50">Branches</div>
            <div className="text-xl font-semibold">{organization?.branches.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            <div className="text-xs text-black/50">Devices</div>
            <div className="text-xl font-semibold">{organization?.devices.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            <div className="text-xs text-black/50">Customer Scope</div>
            <div className="text-xl font-semibold">{business.customerScope === 'BRANCH' ? 'Per branch' : 'Shared'}</div>
          </div>
        </div>
      </div>


      <section id="operating-model" aria-labelledby="operating-heading" className="card scroll-mt-6 p-4 sm:p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/50">Operating model</div>
            <h2 id="operating-heading" className="mt-1 text-lg font-display font-semibold">How this business is structured</h2>
            <p className="mt-1 text-sm text-black/55">
              Set whether customers are shared across the business and whether multi-branch workflows are active.
            </p>
          </div>
          <Link href="/settings/billing" className="btn-secondary text-xs">
            Billing & plans
          </Link>
        </div>

        <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-black/40">Current plan</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{planSummary.name}</span>
                <span className="text-sm text-black/50">{planSummary.summary}</span>
              </div>
            </div>
            {!features.ownerIntelligence ? (
              <div className="text-sm text-black/50">Multi-branch activation is available on Pro.</div>
            ) : null}
          </div>
        </div>

        <form action={updateOrganizationSettingsAction} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="organization-customerScope">Customer Scope</label>
            <select id="organization-customerScope" className="input" name="customerScope" defaultValue={(business as any).customerScope ?? 'SHARED'}>
              <option value="SHARED">Shared across all branches</option>
              <option value="BRANCH">Branch-specific customers</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Shared keeps one customer record across the business. Branch-specific keeps customer lists separated per branch.
            </div>
          </div>
          <div>
            <label className="label" htmlFor="organization-storeMode">Branch Mode</label>
            <select id="organization-storeMode"
              className="input"
              name="storeMode"
              defaultValue={features.multiStore ? 'MULTI_STORE' : 'SINGLE_STORE'}
              disabled={!features.ownerIntelligence}
            >
              <option value="SINGLE_STORE">Single Branch</option>
              <option value="MULTI_STORE">Multi-Branch</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              {features.ownerIntelligence
                ? 'Multi-Branch turns on transfers and branch-aware workflows.'
                : 'Starter and Growth stay in Single Branch mode. Upgrade to Pro to activate multi-branch workflows.'}
            </div>
          </div>
          <div className="md:col-span-2">
            <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto" loadingText="Saving...">
              Save organization settings
            </SubmitButton>
          </div>
        </form>
      </section>

      <section id="branches-devices" aria-label="Branches and devices" className="grid min-w-0 scroll-mt-6 gap-6 xl:grid-cols-2">
        <div className="card min-w-0 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-display font-semibold">Branches</h2><a href="#register-device" className="btn-ghost min-h-11 text-sm">Add device</a></div>
          <ul className="mt-3 space-y-3 md:hidden">{organization?.branches.map(branch => <li key={branch.id} className="rounded-xl border border-border p-3"><div className="break-words font-semibold">{branch.name}</div><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted">Store</dt><dd className="break-words">{branch.store.name}</dd></div><div><dt className="text-muted">Devices</dt><dd>{branch.devices.length}</dd></div><div><dt className="text-muted">Code</dt><dd className="break-all">{branch.code ?? 'Not set'}</dd></div></dl></li>)}</ul>
          <div className="hidden overflow-x-auto md:block"><table className="table mt-3 w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Store</th>
                <th>Code</th>
                <th>Devices</th>
              </tr>
            </thead>
            <tbody>
              {organization?.branches.map((branch) => (
                <tr key={branch.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{branch.name}</td>
                  <td className="px-3 py-3 text-sm">{branch.store.name}</td>
                  <td className="px-3 py-3 text-xs font-mono">{branch.code ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{branch.devices.length}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="card min-w-0 p-4 sm:p-6">
          <h2 className="text-lg font-display font-semibold">Registered devices</h2>
          <ul className="mt-3 space-y-3 md:hidden">{organization?.devices.map(device => <li key={device.id} className="rounded-xl border border-border p-3"><div className="break-words font-semibold">{device.label}</div><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted">Branch</dt><dd className="break-words">{device.branch?.name ?? 'Unassigned'}</dd></div><div><dt className="text-muted">Assigned to</dt><dd className="break-words">{device.user?.name ?? 'Unassigned'}</dd></div><div className="col-span-2"><dt className="text-muted">Registered</dt><dd>{formatDateTime(device.createdAt)}</dd></div></dl></li>)}</ul>
          {!organization?.devices.length && <p className="mt-3 rounded-xl bg-black/[0.02] p-4 text-sm text-muted md:hidden">No devices registered yet. Add a till computer or tablet using Register a device below.</p>}
          <div className="hidden overflow-x-auto md:block"><table className="table mt-3 w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Label</th>
                <th>Branch</th>
                <th>Assigned To</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {organization?.devices.map((device) => (
                <tr key={device.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{device.label}</td>
                  <td className="px-3 py-3 text-sm">{device.branch?.name ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{device.user?.name ?? '-'}</td>
                  <td className="px-3 py-3 text-xs">{formatDateTime(device.createdAt)}</td>
                </tr>
              ))}
              {(organization?.devices.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-black/50">
                    No devices registered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table></div>
        </div>
      </section>
      <details id="register-device" className="card scroll-mt-6 p-4 sm:p-6">
        <summary className="min-h-11 cursor-pointer text-lg font-display font-semibold">Register a device</summary>
        <p className="mt-2 text-sm text-muted">Give each till computer or tablet a name and assign it to a branch.</p>
        <form action={registerDeviceAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="organization-branchId">Branch</label>
            <select id="organization-branchId" className="input" name="branchId" required>
              <option value="">Select branch</option>
              {organization?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="organization-label">Device Label</label>
            <input id="organization-label" className="input" name="label" placeholder="Front counter tablet" required />
          </div>
          <div>
            <label className="label" htmlFor="organization-platform">Platform (optional)</label>
            <input id="organization-platform" className="input" name="platform" placeholder="Windows / Android / iPadOS" />
          </div>
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Registering...">
              Register Device
            </SubmitButton>
          </div>
        </form>
      </details>

      <section id="branding" aria-label="Brand identity" className="min-w-0 scroll-mt-6">
        <MerchantBrandManager
          businessName={business.name}
          action={updateBrandIdentityAction}
          initialBranding={{
            logoUrl: brandingSnapshot?.logoUrl ?? null,
            logoWidth: brandingSnapshot?.logoWidth ?? null,
            logoHeight: brandingSnapshot?.logoHeight ?? null,
            brandCompactLogoUrl: brandingSnapshot?.brandCompactLogoUrl ?? null,
            brandCompactLogoWidth: brandingSnapshot?.brandCompactLogoWidth ?? null,
            brandCompactLogoHeight: brandingSnapshot?.brandCompactLogoHeight ?? null,
            brandSquareLogoUrl: brandingSnapshot?.brandSquareLogoUrl ?? null,
            brandSquareLogoWidth: brandingSnapshot?.brandSquareLogoWidth ?? null,
            brandSquareLogoHeight: brandingSnapshot?.brandSquareLogoHeight ?? null,
            brandInitials: brandingSnapshot?.brandInitials ?? null,
            brandPrimaryColor: brandingSnapshot?.brandPrimaryColor ?? '#2563eb',
            brandCompactMode: brandingSnapshot?.brandCompactMode ?? 'AUTO',
            brandLogoBackground: brandingSnapshot?.brandLogoBackground ?? 'AUTO',
            storefrontLogoUrl: brandingSnapshot?.storefrontLogoUrl ?? null,
            receiptLogoUrl: brandingSnapshot?.receiptLogoUrl ?? null,
            storefrontPrimaryColor: brandingSnapshot?.storefrontPrimaryColor ?? null,
            storefrontTagline: brandingSnapshot?.storefrontTagline ?? null,
          }}
        />

      </section>
    </div>
  );
}
