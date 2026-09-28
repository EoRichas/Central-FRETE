import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/sales/*/service-order': ['./public/service-order-background-portrait.pdf', './node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff'],
  },
};

export default nextConfig;
