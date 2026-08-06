import { redirect } from "next/navigation";
import { DOCS } from "@/lib/docs";

// /docs has no landing page of its own: the sidebar already lists every
// document, so a card index would be a second copy of the same navigation with
// an extra click in front of it. Land on the first doc in reading order — the
// same thing Read the Docs does when you open a project.
export default function DocsIndexPage() {
  redirect(`/docs/${DOCS[0]!.slug}`);
}
