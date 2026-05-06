import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/shop-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TillFlow Shop',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#shop-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      {children}
    </>
  );
}
