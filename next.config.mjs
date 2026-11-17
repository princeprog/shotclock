const production = process.env.NODE_ENV === 'production'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { position: 'bottom-right' },
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  // The Content-Security-Policy is set per request in proxy.ts because it carries a nonce.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig

