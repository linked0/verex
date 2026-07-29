// Proxy for browser-side API calls (see BROWSER_API in src/lib/api.ts).
//
// Was previously a next.config.js `rewrites()` entry — that turned out to be
// evaluated once at `next build` time, not per-request, so the API_URL env
// var (only ever set at Cloud Run *deploy* time via --set-env-vars, never
// present during the Docker build) baked in as its fallback,
// "http://localhost:4000", permanently — no deploy-time env var could ever
// override it afterward. A Route Handler reads process.env fresh on every
// request instead, which is what "runtime, not build-time" actually requires.
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(req: NextRequest, path: string[]) {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  const target = `${apiUrl}/${path.join("/")}${req.nextUrl.search}`;
  const init: RequestInit = { method: req.method, headers: { "content-type": "application/json" } };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  try {
    const res = await fetch(target, init);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err: any) {
    // Network-level failure reaching the API (down, wrong URL, etc.) — return
    // a clean JSON error instead of letting the exception propagate.
    return new Response(JSON.stringify({ error: `upstream API unreachable: ${err?.message ?? err}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
