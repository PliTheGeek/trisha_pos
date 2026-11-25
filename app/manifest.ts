import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trisha Coffea POS',
    short_name: 'Trisha POS',
    description: 'Point of sale application for Trisha Coffea',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
