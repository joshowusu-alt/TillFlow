import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateBusinessAction } from '@/app/actions/settings';
import CashDrawerSetup from '@/components/CashDrawerSetup';
import InstallButton from '@/components/InstallButton';
import ClearSampleDataButton from '@/components/ClearSampleDataButton';

export default async function SettingsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Business Settings" subtitle="VAT settings and company profile." />
      <div className="card p-6">
        <FormError error={searchParams?.error} />
        <form action={updateBusinessAction} className="grid gap-4 md:grid-cols-2">
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
              <option value="GBP">GBP - British Pound (£)</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="EUR">EUR - Euro (€)</option>
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
              <option value="CAD">CAD - Canadian Dollar</option>
              <option value="AUD">AUD - Australian Dollar</option>
              <option value="INR">INR - Indian Rupee (₹)</option>
              <option value="JPY">JPY - Japanese Yen (¥)</option>
              <option value="CNY">CNY - Chinese Yuan (¥)</option>
            </datalist>
            <div className="mt-1 text-xs text-black/50">Type any ISO code or pick from the list.</div>
          </div>
          <div className="flex items-center gap-2">
            <input className="h-4 w-4" type="checkbox" name="vatEnabled" defaultChecked={business.vatEnabled} />
            <label className="text-sm">VAT Enabled</label>
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
              Direct printing requires QZ Tray running on the register.
            </div>
          </div>
          <div>
            <label className="label">Printer Name (optional)</label>
            <input className="input" name="printerName" defaultValue={business.printerName ?? ''} />
            <div className="mt-1 text-xs text-black/50">
              Leave blank to use the system default printer.
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
          <div>
            <label className="label">Opening Capital ({business.currency})</label>
            <input className="input" name="openingCapitalPence" type="number" min="0" step="1" defaultValue={(business as any).openingCapitalPence ?? 0} />
            <div className="mt-1 text-xs text-black/50">
              The initial cash the owner invested into the business, in minor units (pesewas/pence). E.g. {business.currency === 'GHS' ? '₵10,000 = 1000000' : '£10,000 = 1000000'}.
            </div>
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
              Alert when till-close variance exceeds this amount. Example: 2000 = 20.00.
            </div>
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
          <div>
            <label className="label">Customer Scope</label>
            <select className="input" name="customerScope" defaultValue={(business as any).customerScope ?? 'SHARED'}>
              <option value="SHARED">Shared across all branches</option>
              <option value="BRANCH">Branch-specific customers</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Choose whether customer records are shared company-wide or isolated per branch.
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Mode</label>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="SIMPLE"
                  defaultChecked={business.mode !== 'ADVANCED'}
                />
                Simple (default)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="ADVANCED"
                  defaultChecked={business.mode === 'ADVANCED'}
                />
                Advanced (full operations)
              </label>
            </div>
          </div>
          <div>
            <label className="label">Store Mode</label>
            <select className="input" name="storeMode" defaultValue={(business as any).storeMode ?? 'SINGLE_STORE'}>
              <option value="SINGLE_STORE">Single Store</option>
              <option value="MULTI_STORE">Multi-Store</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Single Store hides Transfers and multi-branch features.
            </div>
          </div>
          <div className="md:col-span-2">
            <SubmitButton className="btn-primary" loadingText="Saving…">Save settings</SubmitButton>
          </div>
        </form>
        <div className="mt-4 text-xs text-black/50">
          VAT OFF hides VAT UI and skips VAT posting. VAT ON will post VAT Payable and VAT Receivable (input VAT).
        </div>
        <div className="mt-2 text-xs text-black/50">
          Simple mode hides advanced reporting and enterprise operations from the main navigation.
        </div>
      </div>
      <CashDrawerSetup />

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card flex items-center justify-between p-6 transition hover:shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Install App</h3>
              <p className="text-sm text-black/50">Install on this device</p>
            </div>
          </div>
          <InstallButton />
        </div>
        <a href="/onboarding" className="card flex items-center gap-4 p-6 transition hover:shadow-lg">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accentSoft">
            <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Setup Guide</h3>
            <p className="text-sm text-black/50">Restart the setup wizard anytime</p>
          </div>
        </a>
      </div>

      {/* Data safety trust note */}
      <div className="rounded-xl border border-black/5 bg-slate-50 px-5 py-4 flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-black/30 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <p className="text-xs text-black/50 leading-relaxed">
          Your data is <strong className="text-black/60">encrypted in transit and at rest</strong>, automatically backed up daily,
          and stored on secure cloud infrastructure in Europe (Vercel&nbsp;/&nbsp;AWS&nbsp;eu-west-2).
          TillFlow never shares your business data with third parties.
        </p>
      </div>

      {/* Data management — clear demo/sample data */}
      {user.role === 'OWNER' && (
        <div className="card p-6">
          <h3 className="font-semibold mb-1">Sample Data</h3>
          <p className="text-sm text-black/50 mb-4">
            Remove demo products, sample customers, demo sales and expenses that were
            created during setup. Your own data will not be affected.
          </p>
          <ClearSampleDataButton />
        </div>
      )}
    </div>
  );
}
