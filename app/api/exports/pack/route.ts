import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import {
  buildSalesLedgerCsv,
  buildPurchasesLedgerCsv,
  buildVatReportCsv,
  buildDebtorsListingCsv,
  buildStockMovementsCsv,
} from '@/lib/exports/csv-writers';
import { strToU8, zipSync } from 'fflate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const fromStr = sp.get('from');
  const toStr = sp.get('to');

  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 86400000);
  const to = toStr ? new Date(toStr) : new Date();
  // Clamp 'to' to end of day
  to.setHours(23, 59, 59, 999);
  const range = { from, to };

  const businessId = user.businessId;

  // Generate all CSVs in parallel
  const [salesCsv, purchasesCsv, vatCsv, debtorsCsv, stockCsv] = await Promise.all([
    buildSalesLedgerCsv(businessId, range),
    buildPurchasesLedgerCsv(businessId, range),
    buildVatReportCsv(businessId, range),
    buildDebtorsListingCsv(businessId),
    buildStockMovementsCsv(businessId, range),
  ]);

  const label = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;

  // Zip all CSVs using fflate
  const zip = zipSync({
    [`sales_ledger_${label}.csv`]: strToU8(salesCsv),
    [`purchases_ledger_${label}.csv`]: strToU8(purchasesCsv),
    [`vat_report_${label}.csv`]: strToU8(vatCsv),
    [`debtors_listing.csv`]: strToU8(debtorsCsv),
    [`stock_movements_${label}.csv`]: strToU8(stockCsv),
  });

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="export_pack_${label}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
