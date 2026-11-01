import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trisha POS',
    short_name: 'Trisha POS',
    description: 'Point of sale application for Trisha Cafe',
    start_url: '/login',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/logo/logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo/logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
