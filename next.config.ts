import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // Disable image caching in development for easier updates
    minimumCacheTTL: process.env.NODE_ENV === 'development' ? 0 : 60,
  },
};

export default nextConfig;
