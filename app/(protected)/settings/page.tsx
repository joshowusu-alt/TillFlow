import HashScroll from '@/components/HashScroll';
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
import HelpRequestCard from '@/components/help/HelpRequestCard';
import Link from 'next/link';
import { resolveSoleOrSelectedStoreId } from '@/lib/reliability/selected-store';

export default async function SettingsPage(props: { searchParams?: Promise<{ error?: string; storeId?: string; saved?: string; tillSaved?: string }> }) {
  const searchParams = await props.searchParams;
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const currencySymbol = getCurrencySymbol(business.currency);
  const qzSigningConfigured = isQzSigningConfigured();

  // Fetch opening balance data in parallel
  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  const storeId = resolveSoleOrSelectedStoreId(stores, searchParams?.storeId);
  const store = storeId ? stores.find((row) => row.id === storeId) ?? null : null;
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
      select: { supplierId: true, totalPence: true, returnCreditPence: true, creditSettledPence: true, creditAppliedPence: true, supplier: { select: { name: true } } },
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
      {['created', 'deactivated'].includes(searchParams?.tillSaved ?? '') && <HashScroll key={searchParams?.tillSaved} offset={144} targetId="tills" />}
      <PageHeader title="Business Settings" subtitle="Manage your business, printing, payments, and day-to-day controls." />
      <div className="card p-4 sm:p-6">
        <FormError error={searchParams?.error} />
        {searchParams?.saved === '1' && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Business settings saved.</p>}
        <nav aria-label="Business settings sections" className="mb-6 flex flex-wrap gap-2">
          {[["profile", "Business profile"], ["printing", "Printing"], ["tax", "Tax"], ["controls", "Controls"], ["payments", "Payments"], ["opening-capital", "Opening balances"], ["tills", "Tills & drawers"]].map(([id, label]) => <a key={id} href={'#' + id} className="btn-ghost min-h-11 text-sm">{label}</a>)}
        </nav>
        <form action={updateBusinessAction} className="space-y-6">
          <section id="profile" aria-labelledby="profile-heading" className="grid scroll-mt-6 gap-4 md:grid-cols-2">
          <div className="md:col-span-2 pt-1">
            <h2 id="profile-heading" className="text-lg font-display font-semibold">Business profile</h2>
            <p className="mt-1 text-sm text-black/55">How your business appears on receipts and across the app.</p>
          </div>
          <div>
            <label className="label" htmlFor="settings-name">Business Name</label>
            <input id="settings-name" className="input" name="name" defaultValue={business.name} />
          </div>
          <div>
            <label className="label" htmlFor="settings-businessCategory">Business type</label>
            <select id="settings-businessCategory" className="input" name="businessCategory" defaultValue={(business as { businessCategory?: string | null }).businessCategory ?? ''}>
              <option value="">Select type</option>
              <option value="SUPERMARKET">Supermarket</option>
              <option value="PROVISION">Provisions business</option>
              <option value="MINI_MART">Mini mart</option>
              <option value="PHARMACY">Pharmacy</option>
              <option value="COSMETICS">Cosmetics / beauty</option>
              <option value="HARDWARE">Hardware</option>
              <option value="WHOLESALE">Wholesaler</option>
              {business.businessCategory === "RESTAURANT_STOCK" ? <option value="RESTAURANT_STOCK">Food business with stock</option> : null}
              <option value="FOOD_DISHES">Food business (enable dish setup)</option>
              <option value="OTHER">Other product business</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="settings-currency">Currency</label>
            <input id="settings-currency"
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
          </section>
          <section id="printing" aria-labelledby="printing-heading" className="grid scroll-mt-6 gap-4 border-t border-border pt-6 md:grid-cols-2">
            <h2 id="printing-heading" className="md:col-span-2 text-lg font-display font-semibold">Receipts & label printing</h2>

          <div>
            <label className="label" htmlFor="settings-receiptTemplate">Receipt Template</label>
            <select id="settings-receiptTemplate" className="input" name="receiptTemplate" defaultValue={business.receiptTemplate}>
              <option value="THERMAL_80">Thermal 80mm</option>
              <option value="A4">A4 Full Page</option>
            </select>
            <div className="mt-1 text-xs text-black/50">Template used for printable receipts.</div>
          </div>
          <div>
            <label className="label" htmlFor="settings-printMode">Print Mode</label>
            <select id="settings-printMode" className="input" name="printMode" defaultValue={business.printMode ?? 'DIRECT_ESC_POS'}>
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
                : 'Trusted automatic printing needs an additional setup step. Contact support to enable it, or choose browser printing.'}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="settings-printerName">Printer Name (optional)</label>
            <input id="settings-printerName" className="input" name="printerName" defaultValue={business.printerName ?? ''} />
            <div className="mt-1 text-xs text-black/50">
              Leave blank to use the system default printer.
            </div>
          </div>

          <details className="md:col-span-2 rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">Printer setup help</summary>
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
          </details>

          <div id="label-printing" className="md:col-span-2 rounded-2xl border border-blue-100/80 bg-blue-50/40 px-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-semibold">Label Printing</h3>
                <p className="mt-1 text-sm text-black/55">
                  Set the default label format and choose whether product labels are prepared for browser printing or Zebra-compatible ZPL workflows.
                </p>
              </div>
              <Link href="/products/labels" className="btn-ghost text-xs">
                Open label workspace
              </Link>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="settings-labelSize">Default Label Size</label>
                <select id="settings-labelSize" className="input" name="labelSize" defaultValue={(business as any).labelSize ?? 'SHELF_TAG'}>
                  <option value="SHELF_TAG">Shelf Tag</option>
                  <option value="PRODUCT_STICKER">Product Sticker</option>
                  <option value="A4_SHEET">A4 Sheet</option>
                </select>
                <div className="mt-1 text-xs text-black/50">Preselected on the bulk label print page.</div>
              </div>
              <div>
                <label className="label" htmlFor="settings-labelPrintMode">Label Print Mode</label>
                <select id="settings-labelPrintMode" className="input" name="labelPrintMode" defaultValue={(business as any).labelPrintMode ?? 'BROWSER_PDF'}>
                  <option value="BROWSER_PDF">Browser / PDF</option>
                  <option value="ZPL_DIRECT">ZPL Direct</option>
                </select>
                <div className="mt-1 text-xs text-black/50">
                  Browser/PDF opens printable HTML. ZPL Direct stores your Zebra workflow preference for compatible thermal printers.
                </div>
              </div>
              <div>
                <label className="label" htmlFor="settings-labelPrinterName">Label Printer Name (optional)</label>
                <input id="settings-labelPrinterName" className="input" name="labelPrinterName" defaultValue={(business as any).labelPrinterName ?? ''} />
                <div className="mt-1 text-xs text-black/50">Used when sending labels to a saved thermal printer workflow.</div>
              </div>
            </div>
          </div>
          </section>
          <section id="tax" aria-labelledby="tax-heading" className="grid scroll-mt-6 gap-4 border-t border-border pt-6 md:grid-cols-2">
            <h2 id="tax-heading" className="md:col-span-2 text-lg font-display font-semibold">Tax registration</h2>
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" id="settings-vatEnabled" name="vatEnabled" defaultChecked={business.vatEnabled} />
            <label className="text-sm" htmlFor="settings-vatEnabled">VAT Enabled</label>
          </div>

          <div>
            <label className="label" htmlFor="settings-vatNumber">VAT Number</label>
            <input id="settings-vatNumber" className="input" name="vatNumber" defaultValue={business.vatNumber ?? ''} />
          </div>
          <div>
            <label className="label" htmlFor="settings-tinNumber">GRA TIN</label>
            <input id="settings-tinNumber" className="input" name="tinNumber" defaultValue={(business as any).tinNumber ?? ''} placeholder="e.g. C0012345678" />
            <div className="mt-1 text-xs text-black/50">Ghana Revenue Authority Tax Identification Number.</div>
          </div>
          </section>
          <section id="controls" aria-labelledby="controls-heading" className="grid scroll-mt-6 gap-4 border-t border-border pt-6 md:grid-cols-2">
            <h2 id="controls-heading" className="md:col-span-2 text-lg font-display font-semibold">Operations & risk controls</h2>
          <div className="md:col-span-2">
            <p className="mt-1 text-sm text-black/55">Guardrails for till opening, variances, discounts, and stock adjustments.</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-sm font-semibold text-emerald-900">Sales require an open till</div>
            <div className="mt-0.5 text-xs text-emerald-800">
              Always on for POS sales so every sale is assigned to an active till and shift.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-4 w-4"
              type="checkbox"
              id="settings-varianceReasonRequired" name="varianceReasonRequired"
              defaultChecked={(business as any).varianceReasonRequired ?? true}
            />
            <label className="text-sm" htmlFor="settings-varianceReasonRequired">Require variance reason when closing till</label>
          </div>
          <div>
            <label className="label" htmlFor="settings-discountApprovalThresholdPercent">Discount approval threshold (%)</label>
            <input id="settings-discountApprovalThresholdPercent"
              className="input"
              name="discountApprovalThresholdPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={((business.discountApprovalThresholdBps ?? 1500) / 100).toFixed(2)}
            />
            <div className="mt-1 text-xs text-black/50">
              A manager PIN is required for discounts above this percentage.
            </div>
          </div>
          <div>
            <label className="label" htmlFor="settings-minimumMarginThresholdPercent">Minimum Margin Target (%)</label>
            <input id="settings-minimumMarginThresholdPercent"
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
            <label className="label" htmlFor="settings-inventoryAdjustmentRiskThresholdBase">Inventory Adjustment Risk Threshold (base units)</label>
            <input id="settings-inventoryAdjustmentRiskThresholdBase"
              className="input"
              name="inventoryAdjustmentRiskThresholdBase"
              type="number"
              min="1"
              step="1"
              defaultValue={(business as any).inventoryAdjustmentRiskThresholdBase ?? 50}
            />
          </div>
          <div>
            <label className="label" htmlFor="settings-cashVarianceRiskThresholdAmount">Cash variance alert ({currencySymbol})</label>
            <input id="settings-cashVarianceRiskThresholdAmount"
              className="input"
              name="cashVarianceRiskThresholdAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={((business.cashVarianceRiskThresholdPence ?? 2000) / 100).toFixed(2)}
            />
            <div className="mt-1 text-xs text-black/50">
              Alert when the till-close variance exceeds this amount.
            </div>
          </div>

          </section>
          <section id="payments" aria-labelledby="payments-heading" className="grid scroll-mt-6 gap-4 border-t border-border pt-6 md:grid-cols-2">
            <h2 id="payments-heading" className="md:col-span-2 text-lg font-display font-semibold">Contacts & payments</h2>
          <div className="md:col-span-2">
            <p className="mt-1 text-sm text-black/55">Phone, address, and Mobile Money details used across receipts and payment flows.</p>
          </div>
          <div>
            <label className="label" htmlFor="settings-phone">Phone Number</label>
            <input id="settings-phone" className="input" name="phone" defaultValue={business.phone ?? ''} placeholder="+233 XX XXX XXXX" />
          </div>
          <div>
            <label className="label" htmlFor="settings-address">Business Address</label>
            <input id="settings-address" className="input" name="address" defaultValue={business.address ?? ''} />
          </div>
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" id="settings-momoEnabled" name="momoEnabled" defaultChecked={(business as any).momoEnabled ?? false} />
            <label className="text-sm" htmlFor="settings-momoEnabled">Mobile Money Enabled</label>
          </div>
          <div>
            <label className="label" htmlFor="settings-momoProvider">MoMo Provider</label>
            <select id="settings-momoProvider" className="input" name="momoProvider" defaultValue={(business as any).momoProvider ?? ''}>
              <option value="">Select provider</option>
              <option value="MTN">MTN Mobile Money</option>
              <option value="TELECEL">Telecel Cash</option>
              <option value="AIRTELTIGO">AirtelTigo Money</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="settings-momoNumber">MoMo Number</label>
            <input id="settings-momoNumber" className="input" name="momoNumber" defaultValue={(business as any).momoNumber ?? ''} placeholder="024 XXX XXXX" />
            <div className="mt-1 text-xs text-black/50">Displayed on receipts for customer payments.</div>
          </div>
          </section>
          <div className="lg:sticky lg:bottom-3 z-10 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-black/55">
              Saves the preferences above. Opening balances and tills have their own save actions.
            </div>
            <SubmitButton className="btn-primary" loadingText="Saving…">Save settings</SubmitButton>
          </div>
        </form>
        <div className="mt-4 text-xs text-black/50">
          VAT OFF hides VAT UI and skips VAT posting. VAT ON will post VAT Payable and VAT Receivable (input VAT).
        </div>
      </div>
          <div id="opening-capital" className="card p-4 sm:p-6 scroll-mt-24">
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

      <div id="tills" className="scroll-mt-36" />
      {['created', 'deactivated'].includes(searchParams?.tillSaved ?? '') && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{searchParams?.tillSaved === 'created' ? 'Till added.' : 'Till deactivated.'}</p>}
      <CashDrawerSetup businessId={business.id} />
      {stores.length > 1 ? (
        <form className="card p-4" method="GET">
          <label className="label" htmlFor="settings-storeId">Till store</label>
          <select id="settings-storeId" className="input mt-1" name="storeId" defaultValue={storeId ?? ''} required>
            <option value="">Select a store</option>
            {stores.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
          <button className="btn-secondary mt-3" type="submit">Show tills</button>
        </form>
      ) : null}
      {storeId ? (
        <TillManagement tills={activeTills} storeId={storeId} />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Select a store before adding or deactivating tills.
        </div>
      )}

      <HelpRequestCard relatedRoute="/settings" />

      <div className="card p-5 sm:p-6">
        <h3 className="font-semibold mb-1">Guides</h3>
        <p className="text-sm text-black/50 mb-3">Short steps for owners, cashiers, setup and units.</p>
        <Link href="/help" className="text-sm font-semibold text-accent hover:underline">
          Open help guides →
        </Link>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold mb-1">Related settings</h3>
            <p className="text-sm text-black/50">
              Business keeps company profile, tax, printing, and controls. Use the settings menu for stores, billing, imports, and recovery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/organization" className="btn-secondary text-sm">Organization</Link>
            <Link href="/settings/billing" className="btn-secondary text-sm">Billing</Link>
            <Link href="/settings/import-stock" className="btn-secondary text-sm">Import data</Link>
            {user.role === 'OWNER' && <Link href="/settings/data-repair" className="btn-secondary text-sm">Data repair</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
