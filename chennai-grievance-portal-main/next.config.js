const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy for every page. Next.js inlines small scripts and styles without nonces, so 'unsafe-inline'
 * stays; everything else is limited to this site plus what the pages really load: Google Maps (map picker, optional),
 * Google Fonts (console pages) and map tiles from any https host (OpenStreetMap, Esri). The sharp street map
 * (components/map/basemap.ts) fetches its style, vector tiles, letters and symbols from OpenFreeMap, and its drawing
 * worker comes from jsDelivr at the bundled MapLibre version (already allowed below for scripts and workers).
 * Dev mode also needs eval and the hot-reload socket.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"} https://maps.googleapis.com https://maps.gstatic.com https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  `connect-src 'self' blob: https://maps.googleapis.com https://cdn.jsdelivr.net https://tiles.openfreemap.org${isProd ? "" : " ws: wss:"}`,
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
  // middleware redirects keep the address the browser used: without this, Next rewrote 127.0.0.1 (what start-fast.bat
  // opens) to "localhost" in every redirect to sign-in, a different site to the browser (other cookies; may not resolve).
  // App Router has no /_next/data URLs, which is all else this switch changes.
  skipMiddlewareUrlNormalize: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  // Dev server only (`npm run dev`): keep compiled pages and API routes for an hour instead of dropping them after a minute
  // unused. Each drop meant a 10-20 s recompile on the next click or Jarvis turn on this PC (measured 15 Nov 2026). The site
  // itself should run the production build: start-fast.bat.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 200 },
  // No page uses next/image (the logo is a plain <img>), so the Image Optimization API (/_next/image) is off: it is where
  // Next 14's critical advisories GHSA-2xp9-vwfh-vxw4 and GHSA-2464-fhr4-w9xw (remote code execution via AVIF/SVG) and
  // its image DoS advisories live. docs/SECURITY_AUDIT.md lists the rest and what an upgrade to Next 16 would close.
  images: { unoptimized: true },
  // a second dev server in the same folder (another port) needs its own build folder: NEXT_DIST_DIR=.next-studio
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // LanceDB (Ask District IQ's search index) ships native binaries: Node loads it as is, the bundler leaves it out
  // (Next 15: this key left "experimental"; src/instrumentation.ts, where the AWS store starts loading, needs no flag any more)
  serverExternalPackages: ["@lancedb/lancedb", "apache-arrow", "playwright-core", "tesseract.js", "tesseract.js-core"],
  // Next 15.5: middleware (which matches every /api route) keeps only the first 10 MB of a request body unless told otherwise, so a scanned
  // petition PDF (the Manu Desk takes up to 42 MB a request, lib/manu/constants.ts) or a 10 MB complaint video reached its route cut off and
  // failed with a 500 (QA pass 5, P5-008). Each route still checks its own limit.
  experimental: { middlewareClientMaxBodySize: 48 * 1024 * 1024 },
  eslint: {
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
