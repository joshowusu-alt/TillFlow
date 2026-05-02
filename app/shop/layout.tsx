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
  return children;
}
