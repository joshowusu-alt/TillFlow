import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import PageHeader from '@/components/PageHeader';
import OpeningStockClient from './OpeningStockClient';

export default async function OpeningStockPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);

  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">
          Complete your business setup in Settings first.
        </div>
        <a href="/settings" className="btn-primary mt-4 inline-block">
          Go to Settings
        </a>
      </div>
    );
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true },
    select: {
      id: true,
      name: true,
      barcode: true,
      defaultCostBasePence: true,
      productUnits: {
        select: {
          unitId: true,
          conversionToBase: true,
          isBaseUnit: true,
          unit: { select: { id: true, name: true } },
        },
        orderBy: { isBaseUnit: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opening Stock & Capital"
        subtitle="Record the stock you already have and the cash in your till. This sets your starting point."
        secondaryCta={{ label: '← Back to Setup', href: '/onboarding' }}
      />
      <OpeningStockClient
        products={products}
        currency={business.currency}
        existingCapitalPence={(business as any).openingCapitalPence ?? 0}
      />
    </div>
  );
}
