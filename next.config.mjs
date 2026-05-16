/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/e-portal',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://newwebpay.interswitchng.com https://newwebpay-sandbox.interswitchng.com https://fonts.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src 'self' https://*.interswitchng.com https://*.isw.la https://webpay-ui.interswitchng.com https://webpay-ui.sandbox.isw.la",
              "connect-src 'self' https://*.interswitchng.com https://*.isw.la http://localhost:5000 https://admission-portal-pcu.onrender.com",
              "img-src 'self' data: blob: https:",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/e-portal',
        basePath: false,
        permanent: true,
      },
    ]
  },
}

export default nextConfig

