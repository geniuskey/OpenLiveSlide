/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  transpilePackages: ['@openliveslide/db', '@openliveslide/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
