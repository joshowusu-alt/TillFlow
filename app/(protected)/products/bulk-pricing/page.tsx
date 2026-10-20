import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import BulkPricingClient from '@/components/products/BulkPricingClient';
import { requireBusiness } from '@/lib/auth';
import { getFeatures, type BusinessPlan, type BusinessMode, type StoreMode } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { listProductDivisions } from '@/lib/services/product-classification';

export const dynamic = 'force-dynamic';

export default async function BulkPricingPage() {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const features = getFeatures((business.plan ?? business.mode) as BusinessPlan | BusinessMode, business.storeMode as StoreMode);
  if (!features.advancedOps) return <div className="card space-y-3 p-6"><h1 className="text-xl font-semibold">Bulk pricing</h1><p>Bulk pricing is available on Growth and Pro.</p><Link href="/products" className="btn-secondary">Back to products</Link></div>;
  const [categories, divisions] = await Promise.all([
    prisma.category.findMany({ where: { businessId: business.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listProductDivisions(business.id),
  ]);
  return <div className="space-y-5">
    <PageHeader title="Bulk pricing" subtitle="Review selling-price changes before applying them to your catalogue." actions={<Link href="/products" className="btn-secondary">Back to products</Link>} />
    <div className="rounded-xl border border-accent/20 bg-accentSoft/40 p-4 text-sm">
      Catalogue prices apply across all branches. Connected tills receive them through normal catalogue sync; offline tills keep their last synced prices until they reconnect.
    </div>
    <BulkPricingClient currency={business.currency} categories={categories} divisions={divisions} />
  </div>;
}
