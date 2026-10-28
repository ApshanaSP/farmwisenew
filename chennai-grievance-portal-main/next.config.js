const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy for every page. Next.js inlines small scripts and styles without nonces, so 'unsafe-inline'
 * stays; everything else is limited to this site plus what the pages really load: Google Maps (map picker, optional),
 * Google Fonts (console pages), map tiles from any https host (OpenStreetMap, Esri), and Tesseract's OCR worker and
 * language data (Sources -> scan a paper). Dev mode also needs eval and the hot-reload socket.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"} https://maps.googleapis.com https://maps.gstatic.com https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  `connect-src 'self' blob: https://maps.googleapis.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com${isProd ? "" : " ws: wss:"}`,
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the map picker asks for location, completion photos use the camera, the assistant takes voice
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [])
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  // No page uses next/image (the logo is a plain <img>), so the Image Optimization API (/_next/image) is off: it is where
  // Next 14's critical advisories GHSA-2xp9-vwfh-vxw4 and GHSA-2464-fhr4-w9xw (remote code execution via AVIF/SVG) and
  // its image DoS advisories live. docs/SECURITY_AUDIT.md lists the rest and what an upgrade to Next 16 would close.
  images: { unoptimized: true },
  // a second dev server in the same folder (another port) needs its own build folder: NEXT_DIST_DIR=.next-studio
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // LanceDB (Ask District IQ's search index) ships native binaries: Node loads it as is, the bundler leaves it out
  experimental: {
    serverComponentsExternalPackages: ["@lancedb/lancedb", "apache-arrow", "playwright-core", "tesseract.js", "tesseract.js-core"],
    // src/instrumentation.ts: the AWS store starts loading when the server starts
    instrumentationHook: true
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
