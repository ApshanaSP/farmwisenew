/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // LanceDB (Ask District IQ's search index) ships native binaries: Node loads it as is, the bundler leaves it out
  experimental: {
    serverComponentsExternalPackages: ["@lancedb/lancedb", "apache-arrow"]
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
