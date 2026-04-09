import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { ensureOrganizationAndBranches } from '@/lib/services/branches';
import { registerDeviceAction, syncOrganizationModelAction } from '@/app/actions/branches';
import { updateOrganizationSettingsAction } from '@/app/actions/settings';
import { getFeatures, getPlanSummary } from '@/lib/features';
import { formatDateTime } from '@/lib/format';

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const organization = await ensureOrganizationAndBranches({
    businessId: business.id,
    businessName: business.name,
  });
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  const planSummary = getPlanSummary(features.plan);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization & Branches"
        subtitle="Manage branch structure, customer sharing, and registered devices."
      />

      <FormError error={searchParams?.error} />

      <div className="card p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/50">Operating model</div>
            <h2 className="mt-1 text-lg font-display font-semibold">How this business is structured</h2>
            <p className="mt-1 text-sm text-black/55">
              Set whether customers are shared across the business and whether multi-branch workflows are active.
            </p>
          </div>
          <a href="/settings/billing" className="btn-secondary text-xs">
            Billing & plans
          </a>
        </div>

        <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-black/40">Current plan</div>
              <div className="mt-1 flex items-center gap-2">
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
            <label className="label">Customer Scope</label>
            <select className="input" name="customerScope" defaultValue={(business as any).customerScope ?? 'SHARED'}>
              <option value="SHARED">Shared across all branches</option>
              <option value="BRANCH">Branch-specific customers</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Shared keeps one customer record across the business. Branch-specific keeps customer lists separated per branch.
            </div>
          </div>
          <div>
            <label className="label">Branch Mode</label>
            <select
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
            <SubmitButton className="btn-primary" loadingText="Saving...">
              Save organization settings
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/50">Organization</div>
            <div className="text-lg font-display font-semibold">{organization?.name ?? 'Not configured'}</div>
          </div>
          <form action={syncOrganizationModelAction}>
            <SubmitButton className="btn-secondary text-xs" loadingText="Syncing...">
              Sync Stores to Branches
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
            <div className="text-xl font-semibold">{business.customerScope}</div>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Register Device</h2>
        <form action={registerDeviceAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" required>
              <option value="">Select branch</option>
              {organization?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Device Label</label>
            <input className="input" name="label" placeholder="Front counter tablet" required />
          </div>
          <div>
            <label className="label">Platform (optional)</label>
            <input className="input" name="platform" placeholder="Windows / Android / iPadOS" />
          </div>
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Registering...">
              Register Device
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto p-4">
          <h2 className="text-lg font-display font-semibold">Branches</h2>
          <table className="table mt-3 w-full border-separate border-spacing-y-2">
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
          </table>
        </div>

        <div className="card overflow-x-auto p-4">
          <h2 className="text-lg font-display font-semibold">Registered Devices</h2>
          <table className="table mt-3 w-full border-separate border-spacing-y-2">
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
          </table>
        </div>
      </div>
    </div>
  );
}
