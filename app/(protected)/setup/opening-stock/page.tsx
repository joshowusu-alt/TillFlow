import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import PageHeader from '@/components/PageHeader';
import OpeningStockClient from './OpeningStockClient';
import IssueResolutionBanner from '@/components/IssueResolutionBanner';
import { listStockGapSignals } from '@/lib/improve-records-load';
import {
  IMPROVE_RECORDS_ISSUE_DEFS,
  parseImproveRecordsIssue,
} from '@/lib/improve-records-issues';

export default async function OpeningStockPage({
  searchParams,
}: {
  searchParams?: { issue?: string; productId?: string };
}) {
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

  const issueKey = parseImproveRecordsIssue(searchParams?.issue);
  const stockGapIssue = issueKey === 'STOCK_SETUP_GAP';
  const invalidIssue = Boolean(searchParams?.issue?.trim()) && !stockGapIssue;

  const gapIds = stockGapIssue
    ? (await listStockGapSignals(business.id)).genuineGapProductIds
    : null;

  let productIdFilter: string | undefined;
  if (searchParams?.productId) {
    if (!stockGapIssue || (gapIds?.includes(searchParams.productId) ?? false)) {
      productIdFilter = searchParams.productId;
    }
  }

  const productWhere = {
    businessId: business.id,
    active: true,
    ...(stockGapIssue
      ? {
          id:
            productIdFilter
              ? productIdFilter
              : gapIds && gapIds.length > 0
                ? { in: gapIds }
                : { in: ['__none__'] },
        }
      : productIdFilter
        ? { id: productIdFilter }
        : {}),
  };

  const products = invalidIssue
    ? []
    : await prisma.product.findMany({
        where: productWhere,
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
              defaultCostPence: true,
              unit: { select: { id: true, name: true } },
            },
            orderBy: { isBaseUnit: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });

  const issueDef = IMPROVE_RECORDS_ISSUE_DEFS.STOCK_SETUP_GAP;
  const showIssueBanner = stockGapIssue || invalidIssue;
  const resolved = showIssueBanner && products.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={stockGapIssue && !resolved ? issueDef.heading : 'Opening Stock & Capital'}
        subtitle={
          stockGapIssue && !resolved
            ? `${issueDef.explanation} Showing ${products.length} affected product${products.length === 1 ? '' : 's'}.`
            : 'Record the stock you already have and the cash in your till. This sets your starting point.'
        }
        secondaryCta={{
          label: stockGapIssue ? '← Back to affected products' : '← Back to Setup',
          href: stockGapIssue ? '/products?issue=STOCK_SETUP_GAP' : '/onboarding',
        }}
      />

      {showIssueBanner ? (
        <IssueResolutionBanner
          heading={invalidIssue ? 'Unknown recommendation' : issueDef.heading}
          explanation={
            invalidIssue
              ? 'This recommendation link is no longer valid.'
              : issueDef.explanation
          }
          affectedCount={invalidIssue ? 0 : products.length}
          homeHref="/onboarding"
          clearHref="/setup/opening-stock"
          resolved={resolved || invalidIssue}
        >
          {!resolved && !invalidIssue ? (
            <Link
              href={`/settings/import-stock?mode=OPENING_STOCK&issue=STOCK_SETUP_GAP&count=${products.length}`}
              className="text-xs font-semibold text-accent hover:underline"
            >
              Prefer file import? Open Opening Stock import →
            </Link>
          ) : null}
        </IssueResolutionBanner>
      ) : null}

      {!resolved && !invalidIssue ? (
        <OpeningStockClient
          products={products}
          currency={business.currency}
          existingCapitalPence={(business as any).openingCapitalPence ?? 0}
        />
      ) : null}
    </div>
  );
}
