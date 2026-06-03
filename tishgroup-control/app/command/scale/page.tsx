import ControlPageHeader from '@/components/control-page-header';
import ScaleCockpitView from '@/components/scale/ScaleCockpitView';
import {
  canManageSubscriptions,
  canRecordPayments,
  canWriteNotes,
  listActiveControlStaff,
  requireControlStaff,
} from '@/lib/control-auth';
import { listBusinessAuditTrail, type AuditLogEntry } from '@/lib/audit';
import { getScaleCockpitData } from '@/lib/scale-cockpit/service';
import { readSearchParam, resolveSearchParams, type ControlSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export default async function ScaleCockpitPage({
  searchParams,
}: {
  searchParams?: Promise<ControlSearchParams> | ControlSearchParams;
}) {
  const staff = await requireControlStaff();
  const resolved = await resolveSearchParams(searchParams);
  const filter = readSearchParam(resolved.filter) ?? 'all';
  const search = readSearchParam(resolved.search)?.trim() ?? '';
  const businessId = readSearchParam(resolved.businessId)?.trim() ?? null;
  const error = readSearchParam(resolved.error);
  const updated = readSearchParam(resolved.updated);

  const [data, staffOptions, auditTrail] = await Promise.all([
    getScaleCockpitData(),
    listActiveControlStaff(),
    businessId ? listBusinessAuditTrail(businessId, 30) : Promise.resolve([] as AuditLogEntry[]),
  ]);

  const returnPath = (() => {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('filter', filter);
    if (search) params.set('search', search);
    if (businessId) params.set('businessId', businessId);
    const q = params.toString();
    return q ? `/command/scale?${q}` : '/command/scale';
  })();

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="50-business rollout"
        title="Scale Cockpit"
        description="Daily command centre for onboarding, setup progress, billing follow-up, and support. Uses the same setup progress and billing rules as the merchant app."
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}
      {updated ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Update saved.
        </div>
      ) : null}

      <ScaleCockpitView
        data={data}
        staffOptions={staffOptions.map((s) => ({ id: s.id, name: s.name }))}
        initialFilter={filter}
        initialSearch={search}
        initialBusinessId={businessId}
        auditTrail={auditTrail}
        returnPath={returnPath}
        canManageBilling={canManageSubscriptions(staff.role)}
        canWrite={canWriteNotes(staff.role)}
        canRecordPayments={canRecordPayments(staff.role)}
        supportReturnPath={returnPath}
      />
    </div>
  );
}
