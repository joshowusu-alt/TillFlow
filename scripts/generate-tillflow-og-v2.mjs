/**
 * Generates public/og/tillflow-og-v2.png — the WhatsApp/social link-preview image
 * for www.tillflow.app and /welcome.
 *
 * Fixes vs the previous tillflow-og.png:
 * - clean blue/white app-consistent style instead of a dark navy/teal gradient
 * - full, uncut headline ("POS, stock and cash control for Ghanaian retail")
 * - named trust proof (EL-SHADDAI Supermarket) instead of no proof at all
 * - real product-proof figures (today's sales, expected cash, low stock, receipts)
 * - a legible compact POS checkout card instead of gray placeholder bars
 *
 * Uses the real production wordmark PNG (public/brand/tillflow-logo-blue.png) and
 * the exact brand tokens from tailwind.config.ts so the preview matches the app.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'og');
const LOGO_PATH = path.join(ROOT_DIR, 'public', 'brand', 'tillflow-logo-blue.png');

const WIDTH = 1200;
const HEIGHT = 630;

const COLOR = {
  ink: '#111827',
  paper: '#F8FAFC',
  accent: '#1E40AF',
  accentSoft: '#EFF6FF',
  success: '#059669',
  successSoft: '#D1FAE5',
  muted: '#6B7280',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  momo: '#FACC15',
  momoText: '#422006',
};

const FONT = `'Segoe UI', system-ui, -apple-system, sans-serif`;

function buildSvg() {
  const leftX = 64;

  const headlineLines = ['POS, stock and', 'cash control for', 'Ghanaian retail.'];
  const headlineFontSize = 44;
  const headlineLineHeight = 58;
  const headlineStartY = 226;

  const cardX = 660;
  const cardW = 476;

  const metricsCardY = 64;
  const metricsCardH = 304;

  const posCardY = 384;
  const posCardH = 214;

  const tileGap = 12;
  const tileW = (cardW - 40 * 2 - tileGap) / 2; // 40px inner padding each side
  const tileH = 80;
  const tilesStartX = cardX + 40;
  const tilesStartY = metricsCardY + 108;

  const metrics = [
    { label: "TODAY'S SALES", value: 'GH\u20B58,420', color: COLOR.accent },
    { label: 'EXPECTED CASH', value: 'GH\u20B53,185', color: COLOR.success },
    { label: 'LOW STOCK', value: '14', color: COLOR.amber },
    { label: 'RECEIPTS', value: '126', color: COLOR.ink },
  ];

  const tiles = metrics
    .map((metric, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = tilesStartX + col * (tileW + tileGap);
      const y = tilesStartY + row * (tileH + tileGap);
      return `
        <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="14" fill="${COLOR.paper}" stroke="${COLOR.border}" stroke-width="1"/>
        <text x="${x + 16}" y="${y + 28}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="0.08em" fill="${COLOR.muted}">${metric.label}</text>
        <text x="${x + 16}" y="${y + 62}" font-family="${FONT}" font-size="26" font-weight="800" fill="${metric.color}">${metric.value}</text>
      `;
    })
    .join('\n');

  const trustPillY = 456;
  const trustPillText = 'Trusted by EL-SHADDAI Supermarket';
  const trustPillWidth = 30 + trustPillText.length * 10.6 + 30;

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="${COLOR.paper}"/>
    </linearGradient>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="1080" cy="70" r="240" fill="${COLOR.accent}" opacity="0.06"/>
  <circle cx="90" cy="600" r="200" fill="${COLOR.success}" opacity="0.05"/>

  <!-- Headline -->
  ${headlineLines
    .map(
      (line, index) =>
        `<text x="${leftX}" y="${headlineStartY + index * headlineLineHeight}" font-family="${FONT}" font-size="${headlineFontSize}" font-weight="800" letter-spacing="-0.01em" fill="${COLOR.ink}">${line}</text>`,
    )
    .join('\n  ')}

  <!-- Trust pill -->
  <rect x="${leftX}" y="${trustPillY}" width="${trustPillWidth}" height="44" rx="22" fill="${COLOR.accentSoft}"/>
  <circle cx="${leftX + 24}" cy="${trustPillY + 22}" r="4" fill="${COLOR.accent}"/>
  <text x="${leftX + 40}" y="${trustPillY + 28}" font-family="${FONT}" font-size="17" font-weight="700" fill="${COLOR.accent}">${trustPillText}</text>

  <!-- Domain -->
  <text x="${leftX}" y="536" font-family="${FONT}" font-size="17" font-weight="500" fill="${COLOR.muted}">www.tillflow.app</text>

  <!-- Metrics card -->
  <g filter="url(#cardShadow)">
    <rect x="${cardX}" y="${metricsCardY}" width="${cardW}" height="${metricsCardH}" rx="22" fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="1"/>
  </g>
  <rect x="${cardX + 24}" y="${metricsCardY + 22}" width="118" height="26" rx="13" fill="${COLOR.accentSoft}"/>
  <text x="${cardX + 34}" y="${metricsCardY + 39}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${COLOR.accent}">OWNER VIEW</text>
  <text x="${cardX + cardW - 24}" y="${metricsCardY + 39}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="500" fill="${COLOR.muted}">Main Branch</text>
  <text x="${cardX + 24}" y="${metricsCardY + 78}" font-family="${FONT}" font-size="19" font-weight="700" fill="${COLOR.ink}">Today's operations</text>
  ${tiles}

  <!-- POS checkout card -->
  <g filter="url(#cardShadow)">
    <rect x="${cardX}" y="${posCardY}" width="${cardW}" height="${posCardH}" rx="22" fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="1"/>
  </g>
  <text x="${cardX + 24}" y="${posCardY + 30}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${COLOR.muted}">POS CHECKOUT</text>
  <text x="${cardX + 24}" y="${posCardY + 52}" font-family="${FONT}" font-size="15" font-weight="700" fill="${COLOR.ink}">Kwame Cashier &#183; Main Branch</text>
  <rect x="${cardX + cardW - 100}" y="${posCardY + 20}" width="76" height="26" rx="13" fill="${COLOR.accentSoft}"/>
  <text x="${cardX + cardW - 62}" y="${posCardY + 37}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="${COLOR.accent}">Till open</text>

  <rect x="${cardX + 24}" y="${posCardY + 68}" width="${cardW - 48}" height="42" rx="12" fill="${COLOR.paper}" stroke="${COLOR.border}" stroke-width="1"/>
  <text x="${cardX + 40}" y="${posCardY + 94}" font-family="${FONT}" font-size="14" font-weight="600" fill="${COLOR.ink}">Royal Aroma Rice 5kg</text>
  <text x="${cardX + cardW - 40}" y="${posCardY + 94}" text-anchor="end" font-family="${FONT}" font-size="14" font-weight="700" fill="${COLOR.ink}">GH&#8373;82.00</text>

  <rect x="${cardX + 24}" y="${posCardY + 124}" width="86" height="32" rx="16" fill="${COLOR.accent}"/>
  <text x="${cardX + 67}" y="${posCardY + 145}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#FFFFFF">Cash</text>
  <rect x="${cardX + 118}" y="${posCardY + 124}" width="86" height="32" rx="16" fill="${COLOR.momo}"/>
  <text x="${cardX + 161}" y="${posCardY + 145}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="${COLOR.momoText}">MoMo</text>
  <rect x="${cardX + 212}" y="${posCardY + 124}" width="86" height="32" rx="16" fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="1"/>
  <text x="${cardX + 255}" y="${posCardY + 145}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="${COLOR.muted}">Card</text>

  <rect x="${cardX + 24}" y="${posCardY + 168}" width="${cardW - 48}" height="26" rx="8" fill="${COLOR.accent}"/>
  <text x="${cardX + cardW / 2}" y="${posCardY + 186}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#FFFFFF">Complete Sale &#8212; GH&#8373;82.00</text>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const overlayPng = await sharp(Buffer.from(buildSvg())).png().toBuffer();

  const logoHeight = 46;
  const logoMeta = await sharp(LOGO_PATH).metadata();
  const logoWidth = Math.round(logoHeight * ((logoMeta.width ?? 1712) / (logoMeta.height ?? 481)));
  const logoPng = await sharp(LOGO_PATH).resize({ height: logoHeight, width: logoWidth }).png().toBuffer();

  const pngBuffer = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: overlayPng, top: 0, left: 0 },
      { input: logoPng, top: 60, left: 64 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const outPath = path.join(OUT_DIR, 'tillflow-og-v2.png');
  await writeFile(outPath, pngBuffer);
  console.log(`[og] PNG ${Math.round(pngBuffer.length / 1024)}KB -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
