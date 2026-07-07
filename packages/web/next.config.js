/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server build (.next/standalone) for a lean Docker image.
  output: "standalone",
  // Browser-side API calls go to /backend/* and are proxied here to the API.
  // API_URL is read at server start (runtime), so the same image works in any
  // environment — no NEXT_PUBLIC_ build-time baking.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/backend/:path*", destination: `${api}/:path*` }];
  },
};

module.exports = nextConfig;
