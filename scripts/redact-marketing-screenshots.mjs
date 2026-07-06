/**
 * Redact real business/user names from marketing screenshots.
 * Applies soft blur + demo-safe text overlays.
 */
import sharp from 'sharp';
import { readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT_DIR = join(process.cwd(), 'public', 'marketing');

async function blurRegion(image, region) {
  const { left, top, width, height } = region;
  const blurred = await image
    .clone()
    .extract({ left, top, width, height })
    .blur(12)
    .toBuffer();
  return { input: blurred, left, top };
}

function svgLabel(width, height, lines, options = {}) {
  const fontSize = options.fontSize ?? 13;
  const lineHeight = options.lineHeight ?? 18;
  const padding = options.padding ?? 10;
  const bg = options.bg ?? 'rgba(255,255,255,0.92)';
  const textY = padding + fontSize;
  const svgHeight = padding * 2 + lines.length * lineHeight;
  const textNodes = lines
    .map((line, i) => {
      const y = textY + i * lineHeight;
      const weight = i === 0 ? '700' : '500';
      const size = i === 0 ? fontSize : Math.max(10, fontSize - 1);
      const color = i === 0 ? '#0f172a' : '#64748b';
      return `<text x="${padding}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${line}</text>`;
    })
    .join('');
  return Buffer.from(
    `<svg width="${width}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="10" fill="${bg}"/>
      ${textNodes}
    </svg>`
  );
}

async function redactUserNav(image, width) {
  const left = Math.round(width * 0.62);
  const top = 52;
  const regionWidth = width - left - 8;
  const regionHeight = 46;
  const blur = await blurRegion(image, { left, top, width: regionWidth, height: regionHeight });
  const label = svgLabel(regionWidth - 4, 42, ['Ama Owner', 'OWNER · MAIN BRANCH'], { fontSize: 12 });
  return [
    blur,
    { input: label, left: left + 2, top: top + 2 },
  ];
}

async function saveComposite(sourcePath, composites) {
  const source = readFileSync(sourcePath);
  const tempPath = join(tmpdir(), `tillflow-redact-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await sharp(source).composite(composites).png({ compressionLevel: 9 }).toFile(tempPath);
  try {
    unlinkSync(sourcePath);
  } catch {
    // OneDrive may briefly lock the target; rename still usually succeeds.
  }
  renameSync(tempPath, sourcePath);
}

async function redactPosCheckout() {
  const path = join(OUT_DIR, 'pos-checkout.png');
  const image = sharp(readFileSync(path));
  const { width } = await image.metadata();
  const composites = await redactUserNav(image, width ?? 1024);
  await saveComposite(path, composites);
}

async function redactOwnerDashboard() {
  const path = join(OUT_DIR, 'owner-dashboard.png');
  const image = sharp(readFileSync(path));
  const { width } = await image.metadata();
  const w = width ?? 1024;
  const composites = await redactUserNav(image, w);

  const bannerLeft = 24;
  const bannerTop = 118;
  const bannerWidth = Math.round(w * 0.42);
  const bannerHeight = 56;
  composites.push(await blurRegion(image, { left: bannerLeft, top: bannerTop, width: bannerWidth, height: bannerHeight }));
  composites.push({
    input: svgLabel(bannerWidth - 8, 48, ['Adom Retail Demo', 'Command center · Main Branch'], { fontSize: 15 }),
    left: bannerLeft + 4,
    top: bannerTop + 4,
  });

  await saveComposite(path, composites);
}

async function redactTrendAnalytics() {
  const path = join(OUT_DIR, 'trend-analytics.png');
  const image = sharp(readFileSync(path));
  const { width } = await image.metadata();
  const composites = await redactUserNav(image, width ?? 1024);
  await saveComposite(path, composites);
}

async function redactPeopleRelationships() {
  const path = join(OUT_DIR, 'people-relationships.png');
  const image = sharp(readFileSync(path));
  const { width } = await image.metadata();
  const composites = await redactUserNav(image, width ?? 1024);
  await saveComposite(path, composites);
}

await redactPosCheckout();
await redactOwnerDashboard();
await redactTrendAnalytics();
await redactPeopleRelationships();
console.log('Marketing screenshots redacted with demo-safe labels.');
