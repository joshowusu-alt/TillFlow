/**
 * Generates Apple PWA startup/splash screen images for common iOS device sizes.
 * Run once with: node scripts/generate-startup-images.mjs
 * Output goes to public/splash/ — commit the results.
 *
 * iOS requires device-specific images for the apple-touch-startup-image link tag.
 * Without them, iOS shows a black screen before the HTML document loads.
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPLASH_DIR = join(ROOT, 'public', 'splash');
const ICON_PATH = join(ROOT, 'public', 'brand', 'tillflow-symbol-blue.png');

// Matches AppLaunchLoading bg-[#F8FBFF]
const BG = { r: 248, g: 251, b: 255, alpha: 1 };

// Portrait-only physical pixel dimensions for common iOS devices.
// cssW/cssH are logical CSS pixels (used in the media query in layout.tsx).
const DEVICES = [
  { w: 1290, h: 2796, cssW: 430,  cssH: 932,  dpr: 3, label: 'iPhone 15 Pro Max / 14 Pro Max' },
  { w: 1284, h: 2778, cssW: 428,  cssH: 926,  dpr: 3, label: 'iPhone 15 Plus / 14 Plus / 13 Pro Max' },
  { w: 1179, h: 2556, cssW: 393,  cssH: 852,  dpr: 3, label: 'iPhone 15 / 15 Pro / 14 Pro' },
  { w: 1170, h: 2532, cssW: 390,  cssH: 844,  dpr: 3, label: 'iPhone 14 / 13 / 12' },
  { w: 1080, h: 2340, cssW: 360,  cssH: 780,  dpr: 3, label: 'iPhone 13 mini / 12 mini' },
  { w:  750, h: 1334, cssW: 375,  cssH: 667,  dpr: 2, label: 'iPhone SE (2nd/3rd gen)' },
  { w: 2048, h: 2732, cssW: 1024, cssH: 1366, dpr: 2, label: 'iPad Pro 12.9"' },
  { w: 1668, h: 2388, cssW:  834, cssH: 1194, dpr: 2, label: 'iPad Pro 11"' },
  { w: 1668, h: 2224, cssW:  834, cssH: 1112, dpr: 2, label: 'iPad Air 10.9" / iPad mini' },
];

// Physical icon dimensions (from the full uploaded TillFlow symbol crop)
const ICON_NATURAL_W = 679;
const ICON_NATURAL_H = 465;

async function main() {
  await mkdir(SPLASH_DIR, { recursive: true });

  for (const device of DEVICES) {
    const filename = `apple-splash-${device.w}x${device.h}.png`;
    const outPath = join(SPLASH_DIR, filename);

    // Icon: ~30% of splash width to match native app splash sizing
    const iconW = Math.round(device.w * 0.30);
    const iconH = Math.round(iconW * (ICON_NATURAL_H / ICON_NATURAL_W));

    const iconResized = await sharp(ICON_PATH)
      .flatten({ background: BG })
      .resize(iconW, iconH, { fit: 'contain', background: BG })
      .toBuffer();

    // Center the symbol so iOS never shows a blank or black launch canvas.
    const left = Math.round((device.w - iconW) / 2);
    const top = Math.round((device.h - iconH) / 2);

    await sharp({
      create: { width: device.w, height: device.h, channels: 4, background: BG },
    })
      .composite([{ input: iconResized, left, top }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    console.log(`  ✓  ${filename}  (${device.label})`);
  }

  console.log('\nAll startup images generated in public/splash/');
  console.log('Commit the splash/ directory and re-deploy.');
}

main().catch((err) => { console.error(err); process.exit(1); });
