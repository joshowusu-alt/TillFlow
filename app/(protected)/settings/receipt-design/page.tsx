import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import ReceiptDesignEditor, { type ReceiptDesignValues } from '@/components/ReceiptDesignEditor';
import { requireBusiness } from '@/lib/auth';

import { buildStorefrontUrl } from '@/lib/storefront-url';
import { resolvePrimaryBrandColor } from '@/lib/storefront-branding';
import QRCode from 'qrcode';
import { headers } from 'next/headers';

export default async function ReceiptDesignPage(props: { searchParams?: Promise<{ error?: string; saved?: string }> }) {
  const searchParams = await props.searchParams;
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  if (!business) {
    return <div className="card p-6">Business not found. Please complete setup.</div>;
  }

  const businessAny = business as any;
  const storefrontEnabled = Boolean(businessAny.storefrontEnabled);
  const storefrontSlug = businessAny.storefrontSlug ?? null;
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const requestProtocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  const requestOrigin = requestHost ? `${requestProtocol}://${requestHost}` : null;
  const storefrontUrl = buildStorefrontUrl(storefrontSlug, requestOrigin);
  const showStorefrontQr = Boolean(businessAny.receiptShowStorefrontQr);
  const storefrontPrimaryColor = resolvePrimaryBrandColor(businessAny.storefrontPrimaryColor);
  const merchantBranding = {
    businessName: business.name,
    logoUrl: business.logoUrl ?? null,
    logoWidth: businessAny.logoWidth ?? null,
    logoHeight: businessAny.logoHeight ?? null,
    brandCompactLogoUrl: businessAny.brandCompactLogoUrl ?? null,
    brandCompactLogoWidth: businessAny.brandCompactLogoWidth ?? null,
    brandCompactLogoHeight: businessAny.brandCompactLogoHeight ?? null,
    brandSquareLogoUrl: businessAny.brandSquareLogoUrl ?? null,
    brandSquareLogoWidth: businessAny.brandSquareLogoWidth ?? null,
    brandSquareLogoHeight: businessAny.brandSquareLogoHeight ?? null,
    brandInitials: businessAny.brandInitials ?? null,
    brandPrimaryColor: businessAny.brandPrimaryColor ?? null,
    brandCompactMode: businessAny.brandCompactMode ?? 'AUTO',
    brandLogoBackground: businessAny.brandLogoBackground ?? 'AUTO',
    receiptLogoUrl: business.receiptLogoUrl ?? null,
    storefrontPrimaryColor: businessAny.storefrontPrimaryColor ?? null,
  };
  const storefrontQrPreview =
    storefrontEnabled && storefrontUrl
      ? await QRCode.toDataURL(storefrontUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
        color: { dark: storefrontPrimaryColor, light: '#ffffff' },
      }).catch(() => null)
      : null;

  const initialValues: ReceiptDesignValues = {
          address: business.address ?? '', phone: business.phone ?? '', receiptHeader: business.receiptHeader ?? '',
          receiptFooter: business.receiptFooter ?? '', receiptLogoUrl: business.receiptLogoUrl ?? '', socialMediaHandle: business.socialMediaHandle ?? '',
          receiptShowVatNumber: business.receiptShowVatNumber, receiptShowAddress: business.receiptShowAddress, receiptShowStorefrontQr: showStorefrontQr,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt Design"
        subtitle="Create a clear receipt with your business details, messages, and branding."
      />

      <nav aria-label="Receipt design sections" className="flex flex-wrap gap-2">
        <a href="#receipt-editor" className="btn-secondary min-h-11">Edit design</a>
        <a href="#receipt-preview" className="btn-secondary min-h-11">Preview receipt</a>
        <Link href="/settings#printing" className="btn-ghost min-h-11">Printer settings</Link>
      </nav>
      <FormError error={searchParams?.error} />
      {searchParams?.saved === '1' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Receipt design saved.</p>}
      <ReceiptDesignEditor
        key={JSON.stringify(initialValues)}
        businessName={business.name} currency={business.currency} vatNumber={business.vatNumber}
        merchantBranding={merchantBranding} storefrontEnabled={storefrontEnabled}
        storefrontUrl={storefrontUrl} storefrontQrPreview={storefrontQrPreview}
        initialValues={initialValues}
      />
    </div>
  );
}
