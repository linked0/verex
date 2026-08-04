import { permanentRedirect } from "next/navigation";

// The guide used to live here and is linked from older screenshots and any
// bookmarks; it is now /docs/how-to. Kept as a permanent redirect rather than
// deleted so those links do not 404.
export default function HowToRedirect(): never {
  permanentRedirect("/docs/how-to");
}
