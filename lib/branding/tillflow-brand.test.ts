import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');
const assetExists = (relativePath: string) => existsSync(join(process.cwd(), relativePath));

describe('TillFlow brand logo system', () => {
  it('ships the uploaded logo sources, optimized logo crops, and install icons', () => {
    [
      'public/brand/source/tillflow-logo-white-source.png',
      'public/brand/source/tillflow-logo-blue-source.png',
      'public/brand/source/tillflow-app-icon-source.jpeg',
      'public/brand/tillflow-logo-blue.png',
      'public/brand/tillflow-logo-white.png',
      'public/brand/tillflow-symbol-blue.png',
      'public/brand/tillflow-symbol-white.png',
      'public/brand/tillflow-app-icon.png',
      'public/favicon.png',
      'public/favicon.ico',
      'public/apple-touch-icon.png',
      'public/icons/tillflow-icon-16.png',
      'public/icons/tillflow-icon-32.png',
      'public/icons/tillflow-icon-48.png',
      'public/icons/tillflow-icon-64.png',
      'public/icons/tillflow-icon-96.png',
      'public/icons/tillflow-icon-128.png',
      'public/icons/tillflow-icon-180.png',
      'public/icons/tillflow-icon-192.png',
      'public/icons/tillflow-icon-512.png',
      'public/og/tillflow-og.png',
      'public/splash/apple-splash-1290x2796.png',
      'public/splash/apple-splash-1170x2532.png',
      'public/splash/apple-splash-750x1334.png',
    ].forEach((assetPath) => expect(assetExists(assetPath), assetPath).toBe(true));
  });

  it('keeps the standalone symbol as the full designer mark', async () => {
    const blueSymbol = await sharp(join(process.cwd(), 'public/brand/tillflow-symbol-blue.png')).metadata();
    const whiteSymbol = await sharp(join(process.cwd(), 'public/brand/tillflow-symbol-white.png')).metadata();
    const logo = readSource('components/Logo.tsx');

    expect(blueSymbol.width).toBe(679);
    expect(blueSymbol.height).toBe(465);
    expect(whiteSymbol.width).toBe(679);
    expect(whiteSymbol.height).toBe(465);
    expect(logo).toContain('const MARK_RATIO = MARK_IMG_W / MARK_IMG_H');
  });

  it('uses the new logo component in app, public, and auth headers', () => {
    const logo = readSource('components/Logo.tsx');
    const topNav = readSource('components/TopNav.tsx');
    const welcome = readSource('app/welcome/page.tsx');
    const login = readSource('app/(auth)/login/page.tsx');
    const register = readSource('components/RegisterForm.tsx');

    expect(logo).toContain('/brand/tillflow-logo-blue.png');
    expect(logo).toContain('/brand/tillflow-logo-white.png');
    expect(logo).toContain('/brand/tillflow-symbol-blue.png');
    expect(logo).toContain("alt = 'TillFlow'");
    expect(logo).not.toContain('<svg');
    expect(topNav).toContain('variant="lockup"');
    expect(topNav).toContain('size={28}');
    expect(welcome).toContain('variant="lockup"');
    expect(login).toContain('variant="lockup"');
    expect(register).toContain('variant="lockup"');
  });

  it('points metadata and manifests at the new favicon and PWA icon files', () => {
    const layout = readSource('app/layout.tsx');
    const globals = readSource('app/globals.css');
    const middleware = readSource('middleware.ts');
    const sw = readSource('public/sw.js');
    const manifest = JSON.parse(readSource('public/manifest.json')) as {
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    const shopManifest = JSON.parse(readSource('public/shop-manifest.json')) as {
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string }>;
    };

    expect(layout).toContain('/favicon.png');
    expect(layout).toContain('/apple-touch-icon.png');
    expect(layout).toContain("statusBarStyle: 'default'");
    expect(layout).toContain('html,body{background-color:#F8FBFF}');
    expect(layout).toContain("backgroundColor: '#F8FBFF'");
    expect(layout).not.toContain('black-translucent');
    expect(globals).toContain('background-color: #F8FBFF');
    expect(middleware).toContain("'/brand'");
    expect(middleware).toContain("'/favicon.png'");
    expect(middleware).toContain("'/apple-touch-icon.png'");
    expect(middleware).toContain("'/logo.png'");
    expect(manifest.background_color.toLowerCase()).not.toBe('#000000');
    expect(manifest.background_color.toLowerCase()).not.toBe('#000');
    expect(manifest.theme_color.toUpperCase()).toBe('#1E40AF');
    expect(shopManifest.background_color.toLowerCase()).not.toBe('#000000');
    expect(shopManifest.background_color.toLowerCase()).not.toBe('#000');
    expect(shopManifest.theme_color.toUpperCase()).toBe('#1E40AF');
    expect(manifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-192.png' && icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-512.png' && icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((icon) => icon.src === '/apple-touch-icon.png' && icon.sizes === '180x180')).toBe(true);
    expect(shopManifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-512.png')).toBe(true);
    expect(sw).toContain('/brand/tillflow-logo-blue.png');
    expect(sw).toContain('/brand/tillflow-symbol-blue.png');
    expect(sw).toContain('/apple-touch-icon.png');
    expect(sw).toContain("pos-cache-v17");
  });

  it('shows a branded non-black launch state while the app loads', () => {
    const rootLoading = readSource('app/loading.tsx');
    const protectedLoading = readSource('app/(protected)/loading.tsx');
    const commandCenterLoading = readSource('app/(protected)/reports/command-center/loading.tsx');
    const launchLoading = readSource('components/AppLaunchLoading.tsx');
    const topNav = readSource('components/TopNav.tsx');

    expect(rootLoading).toContain('AppLaunchLoading');
    expect(protectedLoading).toContain('AppLaunchLoading');
    expect(commandCenterLoading).toContain('AppLaunchLoading');
    expect(launchLoading).toContain('Opening TillFlow');
    expect(launchLoading).toContain('Getting your business workspace ready');
    expect(launchLoading).toContain("Getting today's sales, stock, and cash ready.");
    expect(protectedLoading).not.toContain('Preparing your dashboard');
    expect(commandCenterLoading).not.toContain('Preparing your dashboard');
    expect(launchLoading).not.toContain('Loading your business');
    expect(launchLoading).toContain('bg-[#F8FBFF]');
    expect(launchLoading).toContain('variant="lockup"');
    expect(launchLoading).not.toContain('variant="mark"');
    expect(launchLoading).not.toContain('showSkeleton');
    expect(launchLoading).not.toContain('grid grid-cols-3');
    expect(launchLoading).not.toContain('h-12 rounded-2xl');
    expect(launchLoading).not.toContain('bg-black');
    expect(topNav).toContain('variant="lockup"');
    expect(topNav).toContain('size={28}');
  });

  it('generates light iOS startup images from the full non-distorted symbol', async () => {
    const generator = readSource('scripts/generate-startup-images.mjs');
    const splash = await sharp(join(process.cwd(), 'public/splash/apple-splash-1170x2532.png')).metadata();
    const { data, info } = await sharp(join(process.cwd(), 'public/splash/apple-splash-1170x2532.png'))
      .raw()
      .toBuffer({ resolveWithObject: true });
    let blackPixelCount = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset] < 30 && data[offset + 1] < 30 && data[offset + 2] < 30) {
        blackPixelCount += 1;
      }
    }

    expect(generator).toContain('const ICON_NATURAL_W = 679');
    expect(generator).toContain('const ICON_NATURAL_H = 465');
    expect(generator).toContain("fit: 'contain', background: BG");
    expect(generator).not.toContain("fit: 'fill'");
    expect(splash.width).toBe(1170);
    expect(splash.height).toBe(2532);
    expect(blackPixelCount).toBe(0);
  });

  it('uses the new export logo in printable report surfaces', () => {
    const exports = readSource('lib/exports/branded-export.ts');
    const ownerBriefExport = readSource('app/(protected)/reports/owner/export/route.ts');

    expect(exports).toContain('export const TILLFLOW_EXPORT_LOGO');
    expect(exports).toContain('class="tillflow-export-logo"');
    expect(exports).toContain('src="/brand/tillflow-logo-white.png"');
    expect(exports).toContain('alt="TillFlow"');
    expect(ownerBriefExport).toContain('TILLFLOW_EXPORT_LOGO');
  });

  it('keeps compatibility logo filenames on uploaded-artwork derivatives', () => {
    expect(assetExists('public/brand-icon.png')).toBe(true);
    expect(assetExists('public/logo.png')).toBe(true);
    expect(assetExists('public/logo-dark.png')).toBe(true);

    expect(assetExists('public/brand-icon.svg')).toBe(false);
    expect(assetExists('public/logo.svg')).toBe(false);
    expect(assetExists('public/logo-dark.svg')).toBe(false);
  });
});
