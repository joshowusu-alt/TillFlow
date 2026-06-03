import ControlPageHeader from '@/components/control-page-header';
import SupportCockpitView from '@/components/support/SupportCockpitView';
import { canWriteNotes, listActiveControlStaff, requireControlStaff } from '@/lib/control-auth';
import { prisma } from '@/lib/prisma';
import { getSupportCockpitData } from '@/lib/support-issues/service';
import { readSearchParam, resolveSearchParams, type ControlSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export default async function SupportCockpitPage({
  searchParams,
}: {
  searchParams?: Promise<ControlSearchParams> | ControlSearchParams;
}) {
  await requireControlStaff();
  const resolved = await resolveSearchParams(searchParams);
  const filter = readSearchParam(resolved.filter) ?? 'open';
  const search = readSearchParam(resolved.search)?.trim() ?? '';
  const error = readSearchParam(resolved.error);
  const updated = readSearchParam(resolved.updated);

  const staff = await requireControlStaff();

  const [data, staffOptions, businesses] = await Promise.all([
    getSupportCockpitData(),
    listActiveControlStaff(),
    prisma.business.findMany({
      where: { isDemo: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);

  const returnPath = (() => {
    const params = new URLSearchParams();
    if (filter && filter !== 'open') params.set('filter', filter);
    if (search) params.set('search', search);
    const q = params.toString();
    return q ? `/command/support?${q}` : '/command/support';
  })();

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="50-business rollout"
        title="Support"
        description="Track who needs help, what the issue is, who owns it, and what to do next."
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}
      {updated ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Issue saved.
        </div>
      ) : null}

      <SupportCockpitView
        data={data}
        staffOptions={staffOptions.map((s) => ({ id: s.id, name: s.name }))}
        businessOptions={businesses}
        initialFilter={filter}
        initialSearch={search}
        returnPath={returnPath}
        canWrite={canWriteNotes(staff.role)}
      />
    </div>
  );
}
