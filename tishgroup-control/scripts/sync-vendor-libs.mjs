import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controlRoot = path.join(__dirname, '..');
const repoLib = path.join(controlRoot, '..', 'lib');
const vendorRoot = path.join(controlRoot, 'lib', 'vendor');

const FILES = [
  'activation-display.ts',
  'activation-readiness.ts',
  'activation-steps.ts',
  'subscription-lifecycle.ts',
  'plan-pricing.ts',
  'features.ts',
  'whatsapp-templates.ts',
  'referrals/constants.ts',
  'referrals/reporting.ts',
  'guides/content.ts',
  'notifications/utils.ts',
];

function copyFile(relPath) {
  const src = path.join(repoLib, relPath);
  const dest = path.join(vendorRoot, relPath);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing shared lib file: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(repoLib)) {
  const marker = path.join(vendorRoot, 'activation-readiness.ts');
  if (!fs.existsSync(marker)) {
    console.error('[vendor-libs] Missing lib/vendor — run from monorepo: node tishgroup-control/scripts/sync-vendor-libs.mjs');
    process.exit(1);
  }
  console.log('[vendor-libs] Using committed lib/vendor copy.');
  process.exit(0);
}

for (const rel of FILES) {
  copyFile(rel);
}

console.log(`[vendor-libs] Synced ${FILES.length} shared files to lib/vendor/`);
