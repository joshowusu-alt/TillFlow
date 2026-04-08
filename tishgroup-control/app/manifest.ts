import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tish Group Control',
    short_name: 'TG Control',
    description: 'Install the Tish Group commercial control plane for fast access to portfolio, billing, and collections workflows.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f4ef',
    theme_color: '#122126',
    categories: ['business', 'productivity', 'finance'],
    prefer_related_applications: false,
    shortcuts: [
      {
        name: 'Portfolio',
        short_name: 'Portfolio',
        description: 'Open the control-panel overview.',
        url: '/',
      },
      {
        name: 'Businesses',
        short_name: 'Businesses',
        description: 'Jump to managed businesses.',
        url: '/businesses',
      },
      {
        name: 'Collections',
        short_name: 'Collections',
        description: 'Review due and overdue accounts.',
        url: '/collections',
      },
    ],
    icons: [
      {
        src: '/api/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/api/icon?size=180',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}