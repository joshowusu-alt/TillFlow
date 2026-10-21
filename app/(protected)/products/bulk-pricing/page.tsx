import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import BulkPricingClient from '@/components/products/BulkPricingClient';
import { requireBusiness } from '@/lib/auth';
import { getFeatures, type BusinessPlan, type BusinessMode, type StoreMode } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { listProductDivisions } from '@/lib/services/product-classification';
import { getBulkPricingReceipt } from '@/lib/services/bulk-pricing';

export const dynamic = 'force-dynamic';

export default async function BulkPricingPage({ searchParams = {} }: { searchParams?: { batch?: string } }) {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const features = getFeatures((business.plan ?? business.mode) as BusinessPlan | BusinessMode, business.storeMode as StoreMode);
  if (!features.advancedOps) return <div className="card space-y-3 p-6"><h1 className="text-xl font-semibold">Bulk pricing</h1><p>Bulk pricing is available on Growth and Pro.</p><Link href="/products" className="btn-secondary">Back to products</Link></div>;
  const [categories, divisions, receipt] = await Promise.all([
    prisma.category.findMany({ where: { businessId: business.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listProductDivisions(business.id),
    getBulkPricingReceipt(business.id, searchParams.batch),
  ]);
  return <div className="space-y-5">
    <PageHeader title="Bulk pricing" subtitle="Review selling-price changes before applying them to your catalogue." actions={<Link href="/products" className="btn-secondary">Back to products</Link>} />
    <div className="rounded-xl border border-accent/20 bg-accentSoft/40 p-4 text-sm">
      Catalogue prices apply across all branches. Connected tills receive them through normal catalogue sync; offline tills keep their last synced prices until they reconnect.
    </div>
    {receipt && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-semibold">Saved price update · {receipt.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC</p>
      <p>Updated {receipt.updated} {receipt.updated === 1 ? 'product' : 'products'}. The price changes and your reason have been recorded.</p>
      {receipt.reason && <p>Reason: {receipt.reason}</p>}
      <Link href="/products/bulk-pricing" className="mt-2 inline-block font-semibold underline">Start another price update</Link>
    </div>}
    <BulkPricingClient currency={business.currency} categories={categories} divisions={divisions} />
  </div>;
}
