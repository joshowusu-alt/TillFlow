import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { findProbableDuplicateSuppliers } from '@/lib/services/supplier-duplicates';

export const metadata = { title: 'Possible duplicate suppliers' };
export const dynamic = 'force-dynamic';

export default async function SupplierDuplicatesPage() {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const groups = await findProbableDuplicateSuppliers(business.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Possible duplicate suppliers"
        subtitle="Names that match after trim and case-fold. This is a preview only — accounts stay separate."
        secondaryCta={{ label: '← Back to suppliers', href: '/suppliers' }}
      />

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-black/55">
          No probable duplicate supplier names in this business.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.normalizedName} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">
                  “{group.members[0]?.name}” and {group.members.length - 1} similar name
                  {group.members.length - 1 === 1 ? '' : 's'}
                </h2>
                <div className="text-sm text-black/60">
                  Combined amount owed: {formatMoney(group.totalOutstandingPence, business.currency)}
                </div>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {group.members.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <Link href={`/suppliers/${member.id}`} className="font-semibold hover:underline">
                        {member.name}
                      </Link>
                      <div className="text-xs text-black/50">
                        {[member.phone, member.email].filter(Boolean).join(' · ') || 'No contact saved'}
                      </div>
                    </div>
                    <div className="tabular-nums font-semibold">
                      {formatMoney(member.outstandingPence, business.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
