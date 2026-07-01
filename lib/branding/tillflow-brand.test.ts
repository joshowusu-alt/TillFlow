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
      start_url: string;
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
    expect(middleware).toContain("'/splash'");
    expect(middleware).toContain("'/favicon.png'");
    expect(middleware).toContain("'/apple-touch-icon.png'");
    expect(middleware).toContain("'/logo.png'");
    expect(manifest.background_color.toLowerCase()).not.toBe('#000000');
    expect(manifest.background_color.toLowerCase()).not.toBe('#000');
    expect(manifest.start_url).toBe('/launch');
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
    expect(sw).toContain("pos-cache-v19");
    expect(sw).toContain('/launch');
  });

  it('shows a branded non-black launch state while the app loads', () => {
    const rootLoading = readSource('app/loading.tsx');
    const protectedLoading = readSource('app/(protected)/loading.tsx');
    const commandCenterLoading = readSource('app/(protected)/reports/command-center/loading.tsx');
    const launchLoading = readSource('components/AppLaunchLoading.tsx');
    const topNav = readSource('components/TopNav.tsx');

    expect(rootLoading).toContain('AppLaunchLoading');
    expect(rootLoading).toContain('mode="launch"');
    expect(rootLoading).toContain('shell="fullscreen"');
    expect(protectedLoading).not.toContain('AppLaunchLoading');
    expect(protectedLoading).not.toContain('mode="launch"');
    expect(protectedLoading).not.toContain('shell="launch"');
    expect(protectedLoading).toContain('ProtectedRouteLoading');
    expect(protectedLoading).not.toContain('Loading section...');
    expect(protectedLoading).not.toContain('Please wait while TillFlow gets this section ready.');
    expect(protectedLoading).not.toContain('Opening');
    expect(protectedLoading).not.toContain("Getting today's sales, stock, and cash ready.");
    expect(commandCenterLoading).not.toContain("import Skeleton from '@/components/Skeleton'");
    expect(commandCenterLoading).not.toContain('Skeleton variant="card"');
    expect(commandCenterLoading).not.toContain('lg:grid-cols-3');
    expect(commandCenterLoading).not.toContain('lg:grid-cols-2');
    expect(commandCenterLoading).toContain('grid-cols-2');
    expect(commandCenterLoading).toContain('animate-pulse');
    expect(commandCenterLoading).not.toContain('AppLaunchLoading');
    expect(commandCenterLoading).not.toContain('Loading section...');
    expect(commandCenterLoading).not.toContain('Opening your reports workspace');
    expect(launchLoading).toContain('fixed inset-0');
    expect(launchLoading).toContain('z-[9999]');
    expect(launchLoading).toContain('w-screen');
    expect(launchLoading).toContain('min-h-dvh');
    expect(launchLoading).toContain('safe-area-inset-top');
    expect(launchLoading).toContain('safe-area-inset-bottom');
    expect(launchLoading).toContain("mode = 'internal'");
    expect(launchLoading).toContain('INTERNAL_MESSAGE');
    expect(launchLoading).toContain('const useLaunchCopy');
    expect(launchLoading).toContain("mode === 'launch'");
    expect(launchLoading).toContain('Opening ${cleanBusinessName}...');
    expect(launchLoading).toContain('Opening your business workspace');
    expect(launchLoading).toContain('Getting sales, stock, and cash ready.');
    expect(launchLoading).toContain("Getting today's sales, stock, and cash ready.");
    expect(launchLoading).toContain("window.localStorage.getItem('tillflow:lastBusinessName')");
    expect(launchLoading).toContain("window.sessionStorage.getItem('tillflow:launching')");
    expect(launchLoading).toContain("window.sessionStorage.getItem('tillflow:launchSplashSeen')");
    expect(launchLoading).toContain("shell === 'launch' && launchMode");
    expect(protectedLoading).not.toContain('Preparing your dashboard');
    expect(commandCenterLoading).not.toContain('Preparing your dashboard');
    expect(commandCenterLoading).not.toContain('Opening TillFlow');
    expect(launchLoading).not.toContain('Opening TillFlow');
    expect(launchLoading).not.toContain('Loading your business');
    expect(launchLoading).toContain('bg-[#F8FBFF]');
    expect(launchLoading).toContain('variant="lockup"');
    expect(launchLoading).not.toContain('variant="mark"');
    expect(launchLoading).not.toContain('showSkeleton');
    expect(launchLoading).not.toContain('grid grid-cols-3');
    expect(launchLoading).not.toContain('h-12 rounded-2xl');
    expect(launchLoading).not.toContain('bg-black');
    expect(launchLoading).not.toContain('Home');
    expect(launchLoading).not.toContain('POS');
    expect(launchLoading).not.toContain('Shifts');
    expect(launchLoading).not.toContain('More');
    expect(launchLoading).not.toContain('Sync ready');
    expect(launchLoading).not.toContain('Main branch');
    expect(topNav).toContain('variant="lockup"');
    expect(topNav).toContain('size={28}');
  });

  it('defers protected shell badge data so launch content is not blocked by nav KPIs', () => {
    const protectedLayout = readSource('app/(protected)/layout.tsx');
    const topNav = readSource('components/TopNav.tsx');
    const navKpisAction = readSource('app/actions/nav-kpis.ts');
    const onboardingActions = readSource('app/actions/onboarding.ts');

    expect(protectedLayout).not.toContain("import { getTodayKPIs }");
    expect(protectedLayout).not.toContain('countOnlineOrdersNeedingAttention');
    expect(protectedLayout).not.toContain('todaySales={');
    expect(protectedLayout).not.toContain('onlineOrdersCount={');
    expect(protectedLayout).toContain('Suspense fallback={null}');
    expect(protectedLayout).toContain('OwnerSetupBanner');
    expect(navKpisAction).toContain('getTodayKPIs');
    expect(navKpisAction).toContain('countOnlineOrdersNeedingAttention');
    expect(topNav).toContain('setLiveOnlineOrdersCount');
    expect(topNav).toContain('void refreshNavKpis(!todaySales)');
    expect(onboardingActions).toContain('getTodayKPIs');
  });

  it('keeps mobile bottom navigation clearance centralized in the protected shell', () => {
    const globals = readSource('app/globals.css');
    const protectedLayout = readSource('app/(protected)/layout.tsx');
    const bottomTabBar = readSource('components/BottomTabBar.tsx');

    expect(globals).toContain('--mobile-bottom-nav-content-height');
    expect(globals).toContain('--mobile-bottom-nav-height');
    expect(globals).toContain('--mobile-bottom-nav-clearance');
    expect(globals).toContain('scroll-padding-bottom: var(--mobile-bottom-nav-clearance)');
    expect(globals).toContain('.app-main-shell');
    expect(globals).toContain('padding-bottom: var(--mobile-bottom-nav-clearance)');
    expect(globals).toContain('.mobile-bottom-tab-bar');
    expect(globals).toContain('min-height: var(--mobile-bottom-nav-height)');
    expect(globals).toContain('padding-bottom: 1.25rem');
    expect(protectedLayout).toContain('app-main-shell');
    expect(protectedLayout).not.toContain('pb-[calc(9rem+env(safe-area-inset-bottom,0px))]');
    expect(bottomTabBar).toContain('mobile-bottom-tab-bar');
    expect(bottomTabBar).toContain("'/pos'");
  });

  it('gives mobile drawer taps immediate internal route feedback without launch copy', () => {
    const topNav = readSource('components/TopNav.tsx');
    const mobileMenu = readSource('components/NavMobileMenu.tsx');

    expect(topNav).toContain('pendingMobileHref');
    expect(topNav).toContain('data-mobile-route-progress="true"');
    expect(topNav).toContain('Loading selected section');
    expect(topNav).toContain('setPendingMobileHref(null)');
    expect(topNav).toContain('12_000');
    expect(topNav).not.toContain('Opening EL-SHADDAI SUPERMARKET');

    expect(mobileMenu).toContain('pendingHref');
    expect(mobileMenu).toContain('onNavigateStart');
    expect(mobileMenu).not.toContain('onPointerDown');
    expect(mobileMenu).toContain('setMobileOpen(false)');
    expect(mobileMenu).toContain('data-mobile-nav-pending');
    expect(mobileMenu).not.toContain('Opening');
    expect(topNav).toContain('data-route-transition="true"');
    expect(mobileMenu).not.toContain('AppLaunchLoading');
    expect(mobileMenu).not.toContain('Opening your business workspace');
    expect(mobileMenu).not.toContain("Getting today's sales, stock, and cash ready.");
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

  it('injects a pre-hydration splash before React mounts', () => {
    const layout = readSource('app/layout.tsx');
    const splashRemover = readSource('components/SplashRemover.tsx');
    const businessNameSaver = readSource('components/BusinessNameSaver.tsx');
    const launchSessionCompletion = readSource('components/LaunchSessionCompletion.tsx');
    const protectedLayout = readSource('app/(protected)/layout.tsx');
    const onboardingClient = readSource('app/(protected)/onboarding/OnboardingClient.tsx');
    const posPage = readSource('app/(protected)/pos/page.tsx');

    expect(layout).toContain('tillflow-initial-splash');
    expect(layout).toContain('position:fixed');
    expect(layout).toContain('tillflow:lastBusinessName');
    expect(layout).toContain("path==='/launch'");
    expect(layout).toContain("sessionStorage.setItem('tillflow:launching','1')");
    expect(layout).toContain("sessionStorage.removeItem('tillflow:launchSplashSeen')");
    expect(layout).toContain("sessionStorage.getItem('tillflow:launchSplashSeen')");
    expect(layout).toContain('publicAuth');
    expect(layout).toContain('Opening your business workspace');
    expect(layout).toContain('sales, stock, and cash ready.');
    expect(layout).toContain('SplashRemover');
    expect(splashRemover).toContain('tillflow-initial-splash');
    expect(splashRemover).toContain('isLaunchHandoff');
    expect(splashRemover).toContain("window.sessionStorage.getItem('tillflow:launching')");
    expect(splashRemover).toContain("window.sessionStorage.getItem('tillflow:launchSplashSeen')");
    expect(splashRemover).toContain('8000');
    expect(splashRemover).toContain('setTimeout');
    expect(businessNameSaver).toContain('tillflow:lastBusinessName');
    expect(protectedLayout).toContain('BusinessNameSaver');
    expect(protectedLayout).not.toContain('LaunchSessionCompletion');
    expect(onboardingClient).toContain('LaunchSessionCompletion');
    expect(onboardingClient).toContain('ReadinessJourney');
    expect(posPage).toContain('LaunchSessionCompletion');
    expect(posPage).toContain('PosWelcomeShelf');
    expect(launchSessionCompletion).toContain('Mount this only inside real page content');
    expect(launchSessionCompletion).toContain("window.sessionStorage.setItem('tillflow:launchSplashSeen', '1')");
    expect(launchSessionCompletion).toContain("window.sessionStorage.removeItem('tillflow:launching')");
    expect(launchSessionCompletion).toContain('removeInitialSplash');
    expect(launchSessionCompletion).not.toContain('localStorage');
  });

  it('starts the installed PWA on a public launch route that can paint before auth routing', () => {
    const manifest = JSON.parse(readSource('public/manifest.json')) as { start_url: string };
    const launchPage = readSource('app/launch/page.tsx');
    const launchRedirector = readSource('components/LaunchRedirector.tsx');
    const middleware = readSource('middleware.ts');

    expect(manifest.start_url).toBe('/launch');
    expect(assetExists('app/launch/page.tsx')).toBe(true);
    expect(launchPage).not.toContain('requireBusiness');
    expect(launchPage).not.toContain('prisma');
    expect(launchPage).not.toContain('redirect(');
    expect(launchPage).toContain('/brand/tillflow-logo-blue.png');
    expect(launchPage).toContain('LaunchRedirector');
    expect(launchPage).not.toContain('Opening TillFlow');
    expect(launchRedirector).toContain('tillflow:lastBusinessName');
    expect(launchRedirector).toContain("window.sessionStorage.setItem('tillflow:launching', '1')");
    expect(launchRedirector).toContain("window.sessionStorage.removeItem('tillflow:launchSplashSeen')");
    expect(launchRedirector).toContain('Opening ${cleanName}...');
    expect(launchRedirector).toContain('Opening your business workspace...');
    expect(launchRedirector).toContain("Getting today's sales, stock, and cash ready.");
    expect(launchRedirector).toContain('Getting sales, stock, and cash ready.');
    expect(launchRedirector).not.toContain("window.location.replace");
    expect(launchRedirector).toContain("router.push('/onboarding')");
    expect(launchRedirector).toContain("useRouter");
    expect(launchRedirector).toContain('requestAnimationFrame');
    expect(launchRedirector).not.toContain('Opening TillFlow');
    expect(middleware).toContain("'/launch'");
    expect(middleware).toContain('PWA start_url must return HTML immediately');
  });

  it('keeps launch-session state in sessionStorage and last business name in localStorage', () => {
    const sources = [
      readSource('app/layout.tsx'),
      readSource('components/LaunchRedirector.tsx'),
      readSource('components/LaunchSessionCompletion.tsx'),
      readSource('components/SplashRemover.tsx'),
      readSource('components/AppLaunchLoading.tsx'),
      readSource('components/BusinessNameSaver.tsx'),
    ].join('\n');

    expect(sources).toContain('tillflow:launching');
    expect(sources).toContain('tillflow:launchSplashSeen');
    expect(sources).toContain('tillflow:lastBusinessName');
    expect(sources).toContain('sessionStorage');
    expect(readSource('components/BusinessNameSaver.tsx')).toContain("localStorage.setItem('tillflow:lastBusinessName'");
    expect(sources).not.toContain("localStorage.setItem('tillflow:launchSplashSeen'");
    expect(sources).not.toContain("localStorage.getItem('tillflow:launchSplashSeen'");
    expect(sources).not.toContain('Preparing your dashboard');
    expect(sources).not.toContain('Opening TillFlow');
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
