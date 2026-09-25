import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? (process.env.VERCEL ? 'https://axios-hms-api.vercel.app' : 'http://localhost:4000');
const dev = process.env.NODE_ENV !== 'production';

// Pragmatic CSP: Next injects small inline bootstrap scripts, and public pages are static/ISR,
// so a per-request nonce (which forces dynamic rendering) is deliberately not used.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' }, // camera: document capture
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  images: { formats: ['image/avif', 'image/webp'] },
  async rewrites() {
    // Browser talks only to this origin; /api is proxied to the API (nginx does the same in production).
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private portal pages must never be cached by shared caches.
      { source: '/patient/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};

export default nextConfig;
