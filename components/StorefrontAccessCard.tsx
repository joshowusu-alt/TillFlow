'use client';

import { useEffect, useState } from 'react';

type Props = {
  storeName: string;
  storefrontUrl: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  brandPrimaryColor?: string | null;
};

/**
 * Public storefront access card — surfaces the storefront URL and lets the
 * merchant copy/share/open it, plus generate a downloadable QR (PNG) and a
 * printable poster. iOS Safari is supported via anchor-href download with
 * the data: URL produced by the qrcode library.
 */
export default function StorefrontAccessCard({ storeName, storefrontUrl, storeAddress, storePhone, brandPrimaryColor }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qrcode = await import('qrcode');
        const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
        const darkColor = brandPrimaryColor && HEX_PATTERN.test(brandPrimaryColor.trim())
          ? brandPrimaryColor.trim()
          : '#0f172a';
        const dataUrl = await qrcode.toDataURL(storefrontUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          scale: 8,
          color: { dark: darkColor, light: '#ffffff' },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (error) {
        console.error('Failed to render storefront QR', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storefrontUrl, brandPrimaryColor]);

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(storefrontUrl);
      flashToast('Storefront link copied');
    } catch {
      flashToast('Could not copy link');
    }
  }

  async function handleShare() {
    const shareData = {
      title: storeName,
      text: `Shop at ${storeName} — browse and pay with MoMo for pickup.`,
      url: storefrontUrl,
    };
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share(shareData);
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await handleCopy();
  }

  function handleDownloadQr() {
    if (!qrDataUrl) {
      flashToast('Preparing QR — try again in a moment');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = `${slugifyForFilename(storeName)}-storefront-qr.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function handleOpenPoster() {
    if (!qrDataUrl) {
      flashToast('Preparing QR — try again in a moment');
      return;
    }
    const html = renderPosterHtml({
      storeName,
      storefrontUrl,
      storeAddress: storeAddress ?? null,
      storePhone: storePhone ?? null,
      qrDataUrl,
      brandPrimaryColor: brandPrimaryColor ?? null,
    });
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) {
      flashToast('Allow pop-ups to download the poster');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-semibold">Public storefront</h2>
          <p className="mt-1 text-sm text-black/55">
            Share this link or print the QR poster so customers can browse and order online.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <label className="label">Storefront link</label>
            <div className="flex flex-wrap items-stretch gap-2">
              <input
                readOnly
                value={storefrontUrl}
                className="input flex-1 min-w-[220px] bg-black/[0.03] text-sm text-black/65"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" onClick={handleCopy} className="btn-secondary text-sm">
                Copy
              </button>
              <button type="button" onClick={handleShare} className="btn-secondary text-sm">
                Share
              </button>
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-sm"
              >
                Open
              </a>
            </div>
            <div className="mt-1 text-xs text-black/50">
              Share to WhatsApp, Instagram, SMS, or print on flyers and shelf signage.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDownloadQr} className="btn-primary text-sm" disabled={!qrDataUrl}>
              Download QR (PNG)
            </button>
            <button type="button" onClick={handleOpenPoster} className="btn-secondary text-sm" disabled={!qrDataUrl}>
              Download printable poster
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-black/5 bg-white p-3 sm:p-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`Storefront QR for ${storeName}`} className="h-40 w-40 sm:h-48 sm:w-48" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-black/[0.03] text-xs text-black/45 sm:h-48 sm:w-48">
              Generating…
            </div>
          )}
          <div className="text-[11px] font-medium text-black/55">Scan to shop</div>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function slugifyForFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tillflow';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPosterHtml(args: {
  storeName: string;
  storefrontUrl: string;
  storeAddress: string | null;
  storePhone: string | null;
  qrDataUrl: string;
  brandPrimaryColor: string | null;
}) {
  const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const accentColor = args.brandPrimaryColor && HEX_PATTERN.test(args.brandPrimaryColor.trim())
    ? args.brandPrimaryColor.trim()
    : '#1E40AF';
  const escapedName = escapeHtml(args.storeName);
  const escapedUrl = escapeHtml(args.storefrontUrl);
  const escapedAddress = args.storeAddress ? escapeHtml(args.storeAddress) : '';
  const escapedPhone = args.storePhone ? escapeHtml(args.storePhone) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapedName} — Online store poster</title>
<style>
  :root {
    --accent: ${accentColor};
    --ink: #0f172a;
    --muted: #475569;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f8fafc;
    color: var(--ink);
    padding: 32px;
  }
  .poster {
    max-width: 560px;
    margin: 0 auto;
    background: linear-gradient(180deg, #eff6ff 0%, #ffffff 60%);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 28px;
    padding: 36px 32px 32px;
    box-shadow: 0 24px 60px -32px rgba(15, 23, 42, 0.25);
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }
  .title {
    margin: 8px 0 4px;
    font-size: 32px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--muted);
    font-size: 15px;
    line-height: 1.5;
  }
  .qr {
    margin: 24px auto 18px;
    width: 280px;
    height: 280px;
    background: #fff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 24px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr img { width: 100%; height: 100%; }
  .url {
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px;
    color: var(--ink);
    background: rgba(15, 23, 42, 0.05);
    padding: 10px 14px;
    border-radius: 999px;
    word-break: break-all;
  }
  .meta {
    margin-top: 18px;
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }
  .meta strong { color: var(--ink); }
  .footer {
    margin-top: 24px;
    text-align: center;
    font-size: 11px;
    color: rgba(15, 23, 42, 0.45);
  }
  @media print {
    body { background: #fff; padding: 0; }
    .poster { box-shadow: none; border: none; max-width: 100%; }
    .toolbar { display: none !important; }
  }
  .toolbar {
    max-width: 560px;
    margin: 0 auto 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .toolbar button {
    background: var(--accent);
    color: #fff;
    border: 0;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">Print poster</button>
</div>
<div class="poster">
  <div class="eyebrow">Shop online with us</div>
  <div class="title">${escapedName}</div>
  <div class="subtitle">Scan to browse products and place your pickup order.</div>
  <div class="qr"><img src="${args.qrDataUrl}" alt="Scan to shop" /></div>
  <div class="url">${escapedUrl}</div>
  <div class="meta">
    ${escapedAddress ? `<div><strong>${escapedAddress}</strong></div>` : ''}
    ${escapedPhone ? `<div>Call us: <strong>${escapedPhone}</strong></div>` : ''}
  </div>
  <div class="footer">Powered by TillFlow</div>
</div>
</body>
</html>`;
}
