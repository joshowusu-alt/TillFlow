import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateReceiptDesignAction } from '@/app/actions/receipt-design';

import { formatMoney } from '@/lib/format';

export default async function ReceiptDesignPage() {
    const { user, business } = await requireBusiness(['OWNER', 'MANAGER']);
    if (!business) {
        return <div className="card p-6">Business not found. Please complete setup.</div>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Receipt Design"
                subtitle="Customize how your receipts look."
            />

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Settings Form */}
                <div className="card p-6">
                    <h2 className="text-lg font-display font-semibold">Receipt Settings</h2>
                    <form action={updateReceiptDesignAction} className="mt-4 space-y-4">
                        {/* Business Details */}
                        <div>
                            <label className="label">Business Address</label>
                            <textarea
                                name="address"
                                className="input min-h-20"
                                placeholder="123 Main Street&#10;City, State 12345"
                                defaultValue={business.address ?? ''}
                            />
                            <div className="mt-1 text-xs text-black/50">Shown on receipts if enabled</div>
                        </div>

                        <div>
                            <label className="label">Phone Number</label>
                            <input
                                type="text"
                                name="phone"
                                className="input"
                                placeholder="+1 (555) 123-4567"
                                defaultValue={business.phone ?? ''}
                            />
                        </div>

                        {/* Custom Header */}
                        <div>
                            <label className="label">Receipt Header</label>
                            <textarea
                                name="receiptHeader"
                                className="input min-h-16"
                                placeholder="Welcome to our store!"
                                defaultValue={business.receiptHeader ?? ''}
                            />
                            <div className="mt-1 text-xs text-black/50">Custom message at the top of receipts</div>
                        </div>

                        {/* Custom Footer */}
                        <div>
                            <label className="label">Receipt Footer</label>
                            <textarea
                                name="receiptFooter"
                                className="input min-h-16"
                                placeholder="Thank you for shopping with us!&#10;Returns accepted within 7 days."
                                defaultValue={business.receiptFooter ?? ''}
                            />
                            <div className="mt-1 text-xs text-black/50">Custom message at the bottom of receipts</div>
                        </div>

                        {/* Logo URL */}
                        <div>
                            <label className="label">Logo URL</label>
                            <input
                                type="url"
                                name="receiptLogoUrl"
                                className="input"
                                placeholder="https://example.com/logo.png"
                                defaultValue={business.receiptLogoUrl ?? ''}
                            />
                            <div className="mt-1 text-xs text-black/50">URL to your business logo (optional)</div>
                        </div>

                        {/* Social Media */}
                        <div>
                            <label className="label">Social Media Handle</label>
                            <input
                                type="text"
                                name="socialMediaHandle"
                                className="input"
                                placeholder="@yourstore"
                                defaultValue={business.socialMediaHandle ?? ''}
                            />
                            <div className="mt-1 text-xs text-black/50">Instagram, Twitter, or Facebook handle</div>
                        </div>

                        {/* Toggle Options */}
                        <div className="space-y-3 pt-2">
                            <label className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    name="receiptShowVatNumber"
                                    className="h-4 w-4 rounded"
                                    defaultChecked={business.receiptShowVatNumber}
                                />
                                <span className="text-sm">Show VAT Number on receipts</span>
                            </label>
                            <label className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    name="receiptShowAddress"
                                    className="h-4 w-4 rounded"
                                    defaultChecked={business.receiptShowAddress}
                                />
                                <span className="text-sm">Show Business Address on receipts</span>
                            </label>
                        </div>

                        <button type="submit" className="btn-primary">
                            Save Receipt Design
                        </button>
                    </form>
                </div>

                {/* Preview */}
                <div className="card p-6">
                    <h2 className="text-lg font-display font-semibold">Preview</h2>
                    <div className="mt-4 rounded-xl border-2 border-dashed border-black/10 bg-white p-6">
                        <div className="mx-auto max-w-64 space-y-3 text-center text-sm">
                            {/* Logo placeholder */}
                            {business.receiptLogoUrl ? (
                                <img
                                    src={business.receiptLogoUrl}
                                    alt="Logo"
                                    className="mx-auto h-12 object-contain"
                                />
                            ) : (
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-black/5 text-black/30">
                                    Logo
                                </div>
                            )}

                            {/* Business Name */}
                            <div className="text-lg font-bold">{business.name}</div>

                            {/* Address */}
                            {business.receiptShowAddress && business.address && (
                                <div className="whitespace-pre-line text-xs text-black/60">{business.address}</div>
                            )}

                            {/* Phone */}
                            {business.phone && (
                                <div className="text-xs text-black/60">{business.phone}</div>
                            )}

                            {/* VAT Number */}
                            {business.receiptShowVatNumber && business.vatNumber && (
                                <div className="text-xs text-black/60">VAT: {business.vatNumber}</div>
                            )}

                            {/* Header */}
                            {business.receiptHeader && (
                                <div className="whitespace-pre-line border-t border-dashed border-black/10 pt-3 text-xs">
                                    {business.receiptHeader}
                                </div>
                            )}

                            {/* Items placeholder */}
                            <div className="space-y-1 border-y border-dashed border-black/10 py-3">
                                <div className="flex justify-between text-xs">
                                    <span>Sample Item</span>
                                    <span>{formatMoney(500, business.currency)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span>Another Item x2</span>
                                    <span>{formatMoney(1000, business.currency)}</span>
                                </div>
                                <div className="flex justify-between border-t border-black/10 pt-1 font-bold">
                                    <span>Total</span>
                                    <span>{formatMoney(1500, business.currency)}</span>
                                </div>
                            </div>

                            {/* Footer */}
                            {business.receiptFooter && (
                                <div className="whitespace-pre-line text-xs text-black/60">
                                    {business.receiptFooter}
                                </div>
                            )}

                            {/* Social */}
                            {business.socialMediaHandle && (
                                <div className="text-xs text-black/40">
                                    Follow us: {business.socialMediaHandle}
                                </div>
                            )}

                            {/* Timestamp */}
                            <div className="pt-2 text-xs text-black/40">
                                {new Date().toLocaleString()}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 text-center text-xs text-black/50">
                        Preview updates after saving
                    </div>
                </div>
            </div>
        </div>
    );
}
