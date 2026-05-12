/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === '1';
const basePath = process.env.STATIC_BASE_PATH || '';

// Surface flags to client via NEXT_PUBLIC_* so the StaticFetchShim can branch.
if (isStaticExport) process.env.NEXT_PUBLIC_STATIC_EXPORT = '1';
if (basePath) process.env.NEXT_PUBLIC_STATIC_BASE_PATH = basePath;

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? '1' : '',
    NEXT_PUBLIC_STATIC_BASE_PATH: basePath
  },
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
        basePath: basePath || undefined,
        assetPrefix: basePath || undefined
      }
    : {
        experimental: {
          serverActions: {
            bodySizeLimit: '10mb'
          }
        }
      })
};

export default nextConfig;
