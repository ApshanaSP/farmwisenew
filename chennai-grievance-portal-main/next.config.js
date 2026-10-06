/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // a second dev server in the same folder (another port) needs its own build folder: NEXT_DIST_DIR=.next-studio
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // LanceDB (Ask District IQ's search index) ships native binaries: Node loads it as is, the bundler leaves it out
  experimental: {
    serverComponentsExternalPackages: ["@lancedb/lancedb", "apache-arrow"]
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
