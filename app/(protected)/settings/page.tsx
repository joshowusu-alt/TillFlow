import PageHeader from '@/components/PageHeader';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateBusinessAction } from '@/app/actions/settings';
import CashDrawerSetup from '@/components/CashDrawerSetup';
import InstallButton from '@/components/InstallButton';

export default async function SettingsPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Business Settings" subtitle="VAT settings and company profile." />
      <div className="card p-6">
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
          <div className="md:col-span-2">
            <button className="btn-primary">Save settings</button>
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

      {/* Additional Settings Links */}
      <div className="grid gap-4 md:grid-cols-2">
        <a href="/settings/backup" className="card p-6 transition hover:shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Data Backup</h3>
              <p className="text-sm text-black/50">Export and restore your database</p>
            </div>
          </div>
        </a>
        <a href="/settings/receipt-design" className="card p-6 transition hover:shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Receipt Design</h3>
              <p className="text-sm text-black/50">Customize your receipt layout</p>
            </div>
          </div>
        </a>
        <div className="card flex items-center justify-between p-6 transition hover:shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      </div>
    </div>
  );
}
