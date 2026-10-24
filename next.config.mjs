/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp and exifr are server-only; keep them out of the client bundle.
  experimental: {
    serverComponentsExternalPackages: ["sharp", "exifr", "@anthropic-ai/sdk"],
  },
};

export default nextConfig;
