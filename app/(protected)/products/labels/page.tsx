import Link from 'next/link';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import PageHeader from '@/components/PageHeader';
import PlanFeatureBadge from '@/components/PlanFeatureBadge';
import LabelPrintClient from '@/app/(protected)/products/labels/LabelPrintClient';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import type { LabelPrintMode, LabelSize } from '@/lib/labels/types';

export default async function ProductLabelsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    barcode?: string;
    category?: string;
    page?: string;
  };
}) {
  const { business } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  if (!features.advancedOps) {
    return (
      <AdvancedModeNotice
        title="Product Labels is available on Growth and Pro"
        description="Shelf tags, barcode stickers, and label-printing workflows are unlocked on businesses provisioned for Growth or Pro."
        featureName="Product Labels"
        minimumPlan="GROWTH"
      />
    );
  }

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        businessId: business.id,
        active: true,
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        sku: true,
        sellingPriceBasePence: true,
        category: {
          select: {
            id: true,
            name: true,
            colour: true,
          },
        },
        productUnits: {
          where: { isBaseUnit: true },
          take: 1,
          select: {
            unit: {
              select: {
                name: true,
                symbol: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      select: {
        id: true,
        name: true,
        colour: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const initialPage = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const defaultTemplate: LabelSize =
    business.labelSize === 'PRODUCT_STICKER' || business.labelSize === 'A4_SHEET'
      ? business.labelSize
      : 'SHELF_TAG';
  const defaultPrintMode: LabelPrintMode = business.labelPrintMode === 'ZPL_DIRECT' ? 'ZPL_DIRECT' : 'BROWSER_PDF';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Label Printing"
        subtitle="Build shelf tags, barcode stickers, and A4 label sheets from your product catalog."
        actions={
          <>
            <PlanFeatureBadge plan="GROWTH" />
            <Link href="/products" className="btn-secondary justify-center text-sm">
              Back to products
            </Link>
            <Link href="/settings#label-printing" className="btn-primary justify-center text-sm">
              Label settings
            </Link>
          </>
        }
      />

      <LabelPrintClient
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          sku: product.sku,
          sellingPriceBasePence: product.sellingPriceBasePence,
          category: product.category,
          unit: product.productUnits[0]?.unit.symbol ?? product.productUnits[0]?.unit.name ?? null,
        }))}
        categories={categories}
        currency={business.currency}
        defaultTemplate={defaultTemplate}
        labelPrintMode={defaultPrintMode}
        labelPrinterName={business.labelPrinterName ?? null}
        initialSearch={searchParams?.q ?? ''}
        initialBarcode={searchParams?.barcode ?? ''}
        initialCategoryId={searchParams?.category ?? 'ALL'}
        initialPage={initialPage}
      />
    </div>
  );
}
