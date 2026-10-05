import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{source: '/:path*', headers: [
      {key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive'},
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'Referrer-Policy', value: 'same-origin'},
      // SAMEORIGIN preserves the authenticated OS PDF preview inside this app.
      {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
      {key: 'Strict-Transport-Security', value: 'max-age=31536000'},
      {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
      {key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://viacep.com.br${process.env.NODE_ENV === "development" ? " ws:" : ""}; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`},
    ]}];
  },
  outputFileTracingIncludes: {
    '/api/sales/*/service-order': ['./public/service-order-background-portrait.pdf', './node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff'],
  },
};

export default nextConfig;
