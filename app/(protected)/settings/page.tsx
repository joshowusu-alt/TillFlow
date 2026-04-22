import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { updateBusinessAction } from '@/app/actions/settings';
import CashDrawerSetup from '@/components/CashDrawerSetup';
import TillManagement from '@/components/TillManagement';
import OpeningBalancesForm from '@/components/OpeningBalancesForm';
import { getCurrencySymbol } from '@/lib/format';
import { isQzSigningConfigured } from '@/lib/qz-signing.server';
import { prisma } from '@/lib/prisma';

export default async function SettingsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const currencySymbol = getCurrencySymbol(business.currency);
  const qzSigningConfigured = isQzSigningConfigured();

  // Fetch opening balance data in parallel
  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const [openingBalances, customers, suppliers, arInvoices, apInvoices, activeTills] = await Promise.all([
    prisma.openingBalance.findMany({ where: { businessId: business.id } }),
    prisma.customer.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId: business.id, externalRef: { startsWith: 'OB-AR-' } },
      select: { customerId: true, totalPence: true, customer: { select: { name: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        businessId: business.id,
        id: {
          in: (await prisma.journalEntry.findMany({
            where: { businessId: business.id, referenceType: 'OPENING_BALANCE_AP' },
            select: { referenceId: true },
          })).map(j => j.referenceId).filter((id): id is string => !!id),
        },
      },
      select: { supplierId: true, totalPence: true, supplier: { select: { name: true } } },
    }),
    store
      ? prisma.till.findMany({
          where: { storeId: store.id, active: true },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const obData = openingBalances.map(ob => ({
    accountCode: ob.accountCode,
    amountPence: ob.amountPence,
  }));
  const arData = arInvoices
    .filter(inv => inv.customerId)
    .map(inv => ({
      customerId: inv.customerId!,
      customerName: inv.customer?.name ?? 'Unknown',
      totalPence: inv.totalPence,
    }));
  const apData = apInvoices
    .filter(inv => inv.supplierId)
    .map(inv => ({
      supplierId: inv.supplierId!,
      supplierName: inv.supplier?.name ?? 'Unknown',
      totalPence: inv.totalPence,
    }));

  return (
    <div className="space-y-6">
      <PageHeader title="Business Settings" subtitle="Business profile, receipts, VAT configuration, and system controls." />
      <div className="card p-4 sm:p-6">
        <FormError error={searchParams?.error} />
        <form action={updateBusinessAction} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-black/40">Business profile</div>
            <div className="mt-1 text-sm text-black/60">
              Configure receipts, tax settings, payments, and operational guardrails for your business.
            </div>
          </div>

          <div className="md:col-span-2 pt-1">
            <h2 className="text-base font-display font-semibold">Identity & receipts</h2>
            <p className="mt-1 text-sm text-black/55">How your business appears on receipts and across the app.</p>
          </div>
          <div>
            <label className="label">Business Name</label>
            <input className="input" name="name" defaultValue={business.name} />
          </div>
          <div>
            <label className="label">Currency</label>
            <input
              className="input"
              name="currency"
              defaultValue={business.currency}
              list="currency-options"
            />
            <datalist id="currency-options">
              <option value="GHS">GHS - Ghanaian Cedi (₵)</option>
              <option value="NGN">NGN - Nigerian Naira (₦)</option>
              <option value="KES">KES - Kenyan Shilling</option>
              <option value="ZAR">ZAR - South African Rand (R)</option>
              <option value="UGX">UGX - Ugandan Shilling</option>
              <option value="TZS">TZS - Tanzanian Shilling</option>
              <option value="XOF">XOF - West African CFA Franc</option>
              <option value="XAF">XAF - Central African CFA Franc</option>
              <option value="EGP">EGP - Egyptian Pound</option>
              <option value="MAD">MAD - Moroccan Dirham</option>
              <option value="BWP">BWP - Botswana Pula</option>
              <option value="MZN">MZN - Mozambican Metical</option>
              <option value="ZMW">ZMW - Zambian Kwacha</option>
              <option value="GBP">GBP - British Pound (£)</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="EUR">EUR - Euro (€)</option>
              <option value="CAD">CAD - Canadian Dollar</option>
              <option value="AUD">AUD - Australian Dollar</option>
              <option value="INR">INR - Indian Rupee (₹)</option>
              <option value="JPY">JPY - Japanese Yen (¥)</option>
              <option value="CNY">CNY - Chinese Yuan (¥)</option>
            </datalist>
            <div className="mt-1 text-xs text-black/50">Type any ISO code or pick from the list. Common African retail currencies are listed first.</div>
          </div>
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" name="vatEnabled" defaultChecked={business.vatEnabled} />
            <label className="text-sm">VAT Enabled</label>
          </div>

          <div className="md:col-span-2 pt-2">
            <h2 className="text-base font-display font-semibold">Printing & tax</h2>
            <p className="mt-1 text-sm text-black/55">Receipt output, printer setup, and tax registration details for live shop use.</p>
          </div>
          <div>
            <label className="label">Receipt Template</label>
            <select className="input" name="receiptTemplate" defaultValue={business.receiptTemplate}>
              <option value="THERMAL_80">Thermal 80mm</option>
              <option value="A4">A4 Full Page</option>
            </select>
            <div className="mt-1 text-xs text-black/50">Template used for printable receipts.</div>
          </div>
          <div>
            <label className="label">Print Mode</label>
            <select className="input" name="printMode" defaultValue={business.printMode ?? 'DIRECT_ESC_POS'}>
              <option value="DIRECT_ESC_POS">Direct ESC/POS (default)</option>
              <option value="BROWSER_DIALOG">Browser dialog</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Direct printing uses QZ Tray, a small desktop helper that sends receipts straight to the printer from a till computer.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="https://qz.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                Download QZ Tray
              </a>
              <a
                href="https://qz.io/docs/getting-started"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                Setup Guide
              </a>
            </div>
            <div
              className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                qzSigningConfigured
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {qzSigningConfigured
                ? 'Trusted QZ signing is configured. Install and run QZ Tray on each till computer, then allow the site once in QZ Tray to enable direct receipt printing.'
                : 'Trusted QZ signing is not configured yet. Direct print can still work, but fully trusted automatic printing needs QZ_TRAY_CERTIFICATE and QZ_TRAY_PRIVATE_KEY on the server.'}
            </div>
          </div>
          <div>
            <label className="label">Printer Name (optional)</label>
            <input className="input" name="printerName" defaultValue={business.printerName ?? ''} />
            <div className="mt-1 text-xs text-black/50">
              Leave blank to use the system default printer.
            </div>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Deployment notes</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/60 bg-white px-3 py-3 text-sm text-slate-700">
                <div className="font-semibold text-ink">Desktop till</div>
                <div className="mt-1 text-xs text-slate-600">Best for direct thermal printing with QZ Tray and an attached receipt printer.</div>
              </div>
              <div className="rounded-xl border border-white/60 bg-white px-3 py-3 text-sm text-slate-700">
                <div className="font-semibold text-ink">Tablet or phone</div>
                <div className="mt-1 text-xs text-slate-600">Use browser print or PDF/share output when direct printer drivers are not available.</div>
              </div>
              <div className="rounded-xl border border-white/60 bg-white px-3 py-3 text-sm text-slate-700">
                <div className="font-semibold text-ink">If printing is unavailable</div>
                <div className="mt-1 text-xs text-slate-600">Sales still complete normally. Receipts can be reopened later from Sales History for reprint.</div>
              </div>
            </div>
          </div>

          <div id="label-printing" className="md:col-span-2 rounded-2xl border border-blue-100/80 bg-blue-50/40 px-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-semibold">Label Printing</h3>
                <p className="mt-1 text-sm text-black/55">
                  Set the default label format and choose whether product labels are prepared for browser printing or Zebra-compatible ZPL workflows.
                </p>
              </div>
              <a href="/products/labels" className="btn-ghost text-xs">
                Open label workspace
              </a>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label">Default Label Size</label>
                <select className="input" name="labelSize" defaultValue={(business as any).labelSize ?? 'SHELF_TAG'}>
                  <option value="SHELF_TAG">Shelf Tag</option>
                  <option value="PRODUCT_STICKER">Product Sticker</option>
                  <option value="A4_SHEET">A4 Sheet</option>
                </select>
                <div className="mt-1 text-xs text-black/50">Preselected on the bulk label print page.</div>
              </div>
              <div>
                <label className="label">Label Print Mode</label>
                <select className="input" name="labelPrintMode" defaultValue={(business as any).labelPrintMode ?? 'BROWSER_PDF'}>
                  <option value="BROWSER_PDF">Browser / PDF</option>
                  <option value="ZPL_DIRECT">ZPL Direct</option>
                </select>
                <div className="mt-1 text-xs text-black/50">
                  Browser/PDF opens printable HTML. ZPL Direct stores your Zebra workflow preference for compatible thermal printers.
                </div>
              </div>
              <div>
                <label className="label">Label Printer Name (optional)</label>
                <input className="input" name="labelPrinterName" defaultValue={(business as any).labelPrinterName ?? ''} />
                <div className="mt-1 text-xs text-black/50">Used when sending labels to a saved thermal printer workflow.</div>
              </div>
            </div>
          </div>
          <div>
            <label className="label">VAT Number</label>
            <input className="input" name="vatNumber" defaultValue={business.vatNumber ?? ''} />
          </div>
          <div>
            <label className="label">GRA TIN</label>
            <input className="input" name="tinNumber" defaultValue={(business as any).tinNumber ?? ''} placeholder="e.g. C0012345678" />
            <div className="mt-1 text-xs text-black/50">Ghana Revenue Authority Tax Identification Number.</div>
          </div>
          <div id="opening-capital" className="md:col-span-2">
            <h2 className="text-base font-display font-semibold">Opening Balances</h2>
            <p className="mt-1 text-sm text-black/55">
              Record your financial position when you started using TillFlow. These appear on your Balance Sheet.
            </p>
            <div className="mt-3">
              <OpeningBalancesForm
                currencySymbol={currencySymbol}
                customers={customers}
                suppliers={suppliers}
                openingBalances={obData}
                arInvoices={arData}
                apInvoices={apData}
              />
            </div>
          </div>

          <div className="md:col-span-2 pt-2">
            <h2 className="text-base font-display font-semibold">Operations & risk controls</h2>
            <p className="mt-1 text-sm text-black/55">Guardrails for till opening, variances, discounts, and stock adjustments.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-4 w-4"
              type="checkbox"
              name="requireOpenTillForSales"
              defaultChecked={(business as any).requireOpenTillForSales ?? false}
            />
            <label className="text-sm">Block sales until till is opened</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-4 w-4"
              type="checkbox"
              name="varianceReasonRequired"
              defaultChecked={(business as any).varianceReasonRequired ?? true}
            />
            <label className="text-sm">Require variance reason when closing till</label>
          </div>
          <div>
            <label className="label">Discount Approval Threshold (bps)</label>
            <input
              className="input"
              name="discountApprovalThresholdBps"
              type="number"
              min="0"
              max="10000"
              step="1"
              defaultValue={(business as any).discountApprovalThresholdBps ?? 1500}
            />
            <div className="mt-1 text-xs text-black/50">
              Manager PIN required for discounts above this threshold. Example: 1500 = 15%.
            </div>
          </div>
          <div>
            <label className="label">Minimum Margin Target (%)</label>
            <input
              className="input"
              name="minimumMarginThresholdPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={(((business as any).minimumMarginThresholdBps ?? 1500) / 100).toFixed(2)}
            />
            <div className="mt-1 text-xs text-black/50">
              Owner dashboard and margin alerts use this as the default minimum gross margin target unless a product overrides it.
            </div>
          </div>
          <div>
            <label className="label">Inventory Adjustment Risk Threshold (base units)</label>
            <input
              className="input"
              name="inventoryAdjustmentRiskThresholdBase"
              type="number"
              min="1"
              step="1"
              defaultValue={(business as any).inventoryAdjustmentRiskThresholdBase ?? 50}
            />
          </div>
          <div>
            <label className="label">Cash Variance Risk Threshold (minor units)</label>
            <input
              className="input"
              name="cashVarianceRiskThresholdPence"
              type="number"
              min="0"
              step="1"
              defaultValue={(business as any).cashVarianceRiskThresholdPence ?? 2000}
            />
            <div className="mt-1 text-xs text-black/50">
              Alert when till-close variance exceeds this amount. Example: 2000 = {currencySymbol}20.00.
            </div>
          </div>

          <div className="md:col-span-2 pt-2">
            <h2 className="text-base font-display font-semibold">Contacts & payments</h2>
            <p className="mt-1 text-sm text-black/55">Phone, address, and Mobile Money details used across receipts and payment flows.</p>
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" name="phone" defaultValue={business.phone ?? ''} placeholder="+233 XX XXX XXXX" />
          </div>
          <div>
            <label className="label">Business Address</label>
            <input className="input" name="address" defaultValue={business.address ?? ''} />
          </div>
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" name="momoEnabled" defaultChecked={(business as any).momoEnabled ?? false} />
            <label className="text-sm">Mobile Money Enabled</label>
          </div>
          <div>
            <label className="label">MoMo Provider</label>
            <select className="input" name="momoProvider" defaultValue={(business as any).momoProvider ?? ''}>
              <option value="">Select provider</option>
              <option value="MTN">MTN Mobile Money</option>
              <option value="TELECEL">Telecel Cash</option>
              <option value="AIRTELTIGO">AirtelTigo Money</option>
            </select>
          </div>
          <div>
            <label className="label">MoMo Number</label>
            <input className="input" name="momoNumber" defaultValue={(business as any).momoNumber ?? ''} placeholder="024 XXX XXXX" />
            <div className="mt-1 text-xs text-black/50">Displayed on receipts for customer payments.</div>
          </div>
          <div className="md:col-span-2 flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-black/55">
              Save once you finish updating your business profile and operational rules.
            </div>
            <SubmitButton className="btn-primary" loadingText="Saving…">Save settings</SubmitButton>
          </div>
        </form>
        <div className="mt-4 text-xs text-black/50">
          VAT OFF hides VAT UI and skips VAT posting. VAT ON will post VAT Payable and VAT Receivable (input VAT).
        </div>
      </div>
      <CashDrawerSetup businessId={business.id} />
      <TillManagement tills={activeTills} />

      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold mb-1">Related settings</h3>
            <p className="text-sm text-black/50">
              Business keeps company profile, tax, printing, and controls. Use the dedicated tabs below for structure, billing, imports, and recovery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/settings/organization" className="btn-secondary text-sm">Organization</a>
            <a href="/settings/billing" className="btn-secondary text-sm">Billing</a>
            <a href="/settings/import-stock" className="btn-secondary text-sm">Import Stock</a>
            <a href="/settings/data-repair" className="btn-secondary text-sm">Data Repair</a>
          </div>
        </div>
      </div>
    </div>
  );
}
