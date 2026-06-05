/**
 * Generates public/og/tillflow-og.png using the exact LogoMark SVG from components/Logo.tsx
 * and wordmark colours from the production header (Till #1E40AF, Flow #1F2937).
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'og');
const WIDTH = 1200;
const HEIGHT = 630;
const MARK_SIZE = 80;

/** Exact LogoMark from components/Logo.tsx */
const LOGO_MARK_SVG = `<svg width="${MARK_SIZE}" height="${MARK_SIZE}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="og-tf-bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1a368c"/>
      <stop offset="52%" stop-color="#0e1f6a"/>
      <stop offset="100%" stop-color="#080e44"/>
    </linearGradient>
    <radialGradient id="og-tf-sheen" cx="34%" cy="27%" r="54%">
      <stop offset="0%" stop-color="#7ab4ff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7ab4ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="og-tf-ring" x1="512" y1="807" x2="512" y2="217" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="55%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <clipPath id="og-tf-tile"><rect width="1024" height="1024" rx="226" ry="226"/></clipPath>
  </defs>
  <g clip-path="url(#og-tf-tile)">
    <rect width="1024" height="1024" fill="url(#og-tf-bg)"/>
    <rect width="1024" height="1024" fill="url(#og-tf-sheen)"/>
    <line x1="84" y1="464" x2="222" y2="464" stroke="white" stroke-width="3.4" stroke-linecap="round" opacity="0.26"/>
    <line x1="62" y1="511" x2="236" y2="511" stroke="white" stroke-width="3.4" stroke-linecap="round" opacity="0.34"/>
    <line x1="84" y1="558" x2="222" y2="558" stroke="white" stroke-width="3.4" stroke-linecap="round" opacity="0.26"/>
    <path d="M 701.6 738.0 A 295 295 0 1 1 767.5 364.5" fill="none" stroke="url(#og-tf-ring)" stroke-width="44" stroke-linecap="round" opacity="0.18"/>
    <path d="M 701.6 738.0 A 295 295 0 1 1 767.5 364.5" fill="none" stroke="url(#og-tf-ring)" stroke-width="22" stroke-linecap="round"/>
    <rect x="367" y="392" width="142" height="34" fill="white" rx="2"/>
    <rect x="421" y="392" width="34" height="240" fill="white" rx="2"/>
    <rect x="531" y="392" width="34" height="240" fill="white" rx="2"/>
    <rect x="531" y="392" width="138" height="34" fill="white" rx="2"/>
    <rect x="531" y="488" width="105" height="30" fill="white" rx="2"/>
    <rect width="1024" height="1024" rx="226" fill="none" stroke="white" stroke-width="2.5" opacity="0.07"/>
  </g>
</svg>`;

function buildOverlaySvg() {
  const markX = 72;
  const markY = 68;
  const wordmarkX = markX + MARK_SIZE + 16;
  const wordmarkY = markY + 54;
  const lockupPadW = wordmarkX - markX + 200;
  const lockupPadH = MARK_SIZE + 20;

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}">
      <stop offset="0%" stop-color="#0e1f6a"/>
      <stop offset="45%" stop-color="#1a368c"/>
      <stop offset="100%" stop-color="#122654"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="980" cy="80" r="220" fill="#2563eb" opacity="0.12"/>
  <circle cx="120" cy="560" r="180" fill="#06b6d4" opacity="0.08"/>

  <rect x="${markX - 14}" y="${markY - 10}" width="${lockupPadW}" height="${lockupPadH}" rx="18" fill="#ffffff" fill-opacity="0.95"/>

  <text x="${wordmarkX}" y="${wordmarkY}" font-family="'Segoe UI', system-ui, sans-serif" font-size="44" font-weight="700" fill="#1E40AF">Till</text>
  <text x="${wordmarkX + 88}" y="${wordmarkY}" font-family="'Segoe UI', system-ui, sans-serif" font-size="44" font-weight="700" fill="#1F2937">Flow</text>

  <text x="${markX}" y="196" font-family="'Segoe UI', system-ui, sans-serif" font-size="50" font-weight="800" fill="#ffffff">Sell fast.</text>
  <text x="${markX}" y="254" font-family="'Segoe UI', system-ui, sans-serif" font-size="50" font-weight="800" fill="#ffffff">Track stock.</text>
  <text x="${markX}" y="312" font-family="'Segoe UI', system-ui, sans-serif" font-size="50" font-weight="800" fill="#7dd3fc">Know your money.</text>
  <text x="${markX}" y="362" font-family="'Segoe UI', system-ui, sans-serif" font-size="23" font-weight="500" fill="#cbd5e1">Built for Ghanaian businesses</text>

  <g transform="translate(620, 72)" filter="url(#shadow)">
    <rect width="500" height="486" rx="24" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5"/>
    <rect width="500" height="56" rx="24" fill="#1E40AF"/>
    <rect y="32" width="500" height="24" fill="#1E40AF"/>
    <text x="24" y="36" font-family="system-ui, sans-serif" font-size="13" fill="#dbeafe" opacity="0.85">Adom Retail Demo</text>
    <text x="24" y="58" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Today's Overview</text>
    <rect x="24" y="84" width="145" height="88" rx="14" fill="#ffffff" fill-opacity="0.95"/>
    <text x="40" y="110" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Revenue Today</text>
    <text x="40" y="148" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#1E40AF">GH&#8373;4,280</text>
    <rect x="178" y="84" width="145" height="88" rx="14" fill="#ffffff" fill-opacity="0.95"/>
    <text x="194" y="110" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Gross Profit</text>
    <text x="194" y="148" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#059669">GH&#8373;980</text>
    <rect x="332" y="84" width="145" height="88" rx="14" fill="#ffffff" fill-opacity="0.95"/>
    <text x="348" y="110" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">MoMo Collected</text>
    <text x="348" y="148" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#d97706">GH&#8373;1,640</text>
    <rect x="24" y="192" width="452" height="120" rx="14" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.12"/>
    <text x="40" y="220" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" letter-spacing="0.12em">HOW MONEY CAME IN</text>
    <rect x="40" y="238" width="300" height="10" rx="5" fill="#ffffff" fill-opacity="0.12"/>
    <rect x="40" y="238" width="174" height="10" rx="5" fill="#059669"/>
    <text x="40" y="270" font-family="system-ui, sans-serif" font-size="13" fill="#e2e8f0">Cash 58% · MoMo 38% · Credit 4%</text>
    <rect x="24" y="332" width="452" height="56" rx="12" fill="#fef3c7" fill-opacity="0.92"/>
    <text x="40" y="366" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#92400e">3 products low on stock — sample alert</text>
    <rect x="24" y="404" width="210" height="58" rx="12" fill="#1E40AF"/>
    <text x="44" y="440" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#ffffff">Point of Sale</text>
    <rect x="252" y="404" width="224" height="58" rx="12" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.2"/>
    <text x="272" y="440" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="#ffffff">Owner Reports</text>
  </g>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const markPng = await sharp(Buffer.from(LOGO_MARK_SVG)).png().toBuffer();
  const overlayPng = await sharp(Buffer.from(buildOverlaySvg())).png().toBuffer();

  const pngBuffer = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 14, g: 31, b: 106, alpha: 1 } },
  })
    .composite([
      { input: overlayPng, top: 0, left: 0 },
      { input: markPng, top: 68, left: 72 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const outPath = path.join(OUT_DIR, 'tillflow-og.png');
  await writeFile(outPath, pngBuffer);
  console.log(`[og] PNG ${Math.round(pngBuffer.length / 1024)}KB → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
