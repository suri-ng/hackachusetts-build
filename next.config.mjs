/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native/server-only image metadata dependencies must never enter the client.
  serverExternalPackages: ['sharp', 'exifr'],
};

export default nextConfig;
