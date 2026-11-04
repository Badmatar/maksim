import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  images: { qualities: [75, 85] },
  experimental: { cpus: 2 },
  serverExternalPackages: ['@prisma/client'],
  // Prisma loads the Rust-free query compiler dynamically from the generated
  // client directory. Include it explicitly in every serverless function trace.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/.prisma/client/**/*', './public/images/maksim-welcome.png'],
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      ],
    }, {
      source: '/miniapp',
      headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" }],
    }];
  },
};
export default config;
