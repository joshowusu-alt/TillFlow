import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { ensureOrganizationAndBranches } from '@/lib/services/branches';
import { registerDeviceAction, syncOrganizationModelAction } from '@/app/actions/branches';
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization & Branches"
        subtitle="Manage branch mappings and registered devices."
      />

      <FormError error={searchParams?.error} />

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
