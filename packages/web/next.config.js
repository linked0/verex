/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server build (.next/standalone) for a lean Docker image.
  output: "standalone",
  // A verification build (`NEXT_DIST_DIR=.next-verify next build`) can run
  // while a dev/prod server is live on the default .next — they share that
  // directory otherwise, and a build corrupts the running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Browser-side API calls go to /backend/* — proxied by
  // src/app/backend/[...path]/route.ts, NOT a next.config.js rewrite. A
  // rewrite's destination is evaluated once at `next build` time, which
  // would bake in whatever API_URL happens to be set during the Docker
  // build (never — it's only set later via `gcloud run deploy
  // --set-env-vars`) rather than reading it per-request at runtime.
};

module.exports = nextConfig;
