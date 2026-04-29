/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@openliveslide/db', '@openliveslide/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
