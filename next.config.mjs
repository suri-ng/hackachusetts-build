/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // sharp/exifr are server-only native deps; keep them out of the bundle.
    serverComponentsExternalPackages: ['sharp', 'exifr'],
  },
};

export default nextConfig;
