/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server build (.next/standalone) for a lean Docker image.
  output: "standalone",
};

module.exports = nextConfig;
