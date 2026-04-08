import { createControlStaffAction, toggleControlStaffAction } from '@/app/actions/control-businesses';
import SectionHeading from '@/components/section-heading';
import { canManageStaff, listControlStaffDirectory, requireControlStaff } from '@/lib/control-auth';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const currentStaff = await requireControlStaff();
  const staffDirectory = await listControlStaffDirectory();
  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;
  const error = readSearchParam(resolvedSearchParams.error);
  const updated = readSearchParam(resolvedSearchParams.updated);
  const canEditStaff = canManageStaff(currentStaff.role);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">{error}</div>
      ) : null}

      {updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          TG staff directory updated.
        </div>
      ) : null}

      <section className="panel p-6">
        <SectionHeading
          eyebrow="TG staff"
          title="Control team directory"
          description="Create account managers, collections operators, and support staff here so the control plane reflects real ownership instead of one bootstrap admin."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel p-6">
          <SectionHeading
            eyebrow="Create staff"
            title="Add or reactivate a TG operator"
            description="If the email already exists, saving here updates the name and role and reactivates the account."
          />

          {canEditStaff ? (
            <form action={createControlStaffAction} className="mt-5 space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Full name</span>
                <input type="text" name="name" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" required />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Email</span>
                <input type="email" name="email" placeholder="name@tishgroup.com" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" required />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Role</span>
                <select name="role" defaultValue="ACCOUNT_MANAGER" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                  <option value="CONTROL_ADMIN">Control admin</option>
                  <option value="ACCOUNT_MANAGER">Account manager</option>
                  <option value="COLLECTIONS_AGENT">Collections agent</option>
                  <option value="SUPPORT_AGENT">Support agent</option>
                </select>
              </label>

              <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-[#122126] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d1a1e] sm:w-fit">
                Save staff account
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/56">
              Your role can view the TG staff directory, but only Control admins can create or deactivate staff accounts.
            </div>
          )}
        </div>

        <div className="panel overflow-hidden p-0">
          <div className="border-b border-black/8 px-6 py-5">
            <SectionHeading
              eyebrow="Active and inactive"
              title="Current TG operators"
              description="This is the live staff directory used by assignment and review workflows."
            />
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {staffDirectory.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="font-semibold text-control-ink">{entry.name}</div>
                      <div className="mt-1 text-xs text-black/55">{entry.email}</div>
                    </td>
                    <td className="text-sm text-black/66">{entry.role.replace(/_/g, ' ')}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${entry.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {entry.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-sm text-black/66">{entry.createdAt}</td>
                    <td>
                      {canEditStaff ? (
                        <form action={toggleControlStaffAction}>
                          <input type="hidden" name="staffId" value={entry.id} />
                          <input type="hidden" name="makeActive" value={entry.active ? 'false' : 'true'} />
                          <button type="submit" className="inline-flex rounded-2xl border border-black/12 bg-white px-3 py-2 text-xs font-semibold text-control-ink transition hover:bg-black/[0.03]">
                            {entry.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </form>
                      ) : <span className="text-xs text-black/45">View only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}