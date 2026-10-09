import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  trailingSlash: false,
  devIndicators: false,
};
export default nextConfig;
