import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

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
    ].forEach((assetPath) => expect(assetExists(assetPath), assetPath).toBe(true));
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
    expect(topNav).toContain('h-8 w-auto');
    expect(welcome).toContain('variant="lockup"');
    expect(login).toContain('variant="lockup"');
    expect(register).toContain('variant="lockup"');
  });

  it('points metadata and manifests at the new favicon and PWA icon files', () => {
    const layout = readSource('app/layout.tsx');
    const middleware = readSource('middleware.ts');
    const manifest = JSON.parse(readSource('public/manifest.json')) as {
      icons: Array<{ src: string; sizes: string }>;
    };
    const shopManifest = JSON.parse(readSource('public/shop-manifest.json')) as {
      icons: Array<{ src: string; sizes: string }>;
    };

    expect(layout).toContain('/favicon.png');
    expect(layout).toContain('/apple-touch-icon.png');
    expect(middleware).toContain("'/brand'");
    expect(middleware).toContain("'/favicon.png'");
    expect(middleware).toContain("'/apple-touch-icon.png'");
    expect(middleware).toContain("'/logo.png'");
    expect(manifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-192.png' && icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-512.png' && icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((icon) => icon.src === '/apple-touch-icon.png' && icon.sizes === '180x180')).toBe(true);
    expect(shopManifest.icons.some((icon) => icon.src === '/icons/tillflow-icon-512.png')).toBe(true);
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
