import CreateClient from "./CreateClient";

// Server wrapper so this route segment config actually applies — `export const
// dynamic` is ignored in a "use client" file. Same latent bug as /portfolio:
// static prerender + a year-long s-maxage meant the ?edit=<slug> flows would
// serve stale placeholder HTML instead of the market's current fields.
export const dynamic = "force-dynamic";

export default function CreatePage() {
  return <CreateClient />;
}
