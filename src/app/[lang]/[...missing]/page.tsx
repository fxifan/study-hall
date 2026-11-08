import { notFound } from "next/navigation";

/** Any URL no other route matches: show [lang]/not-found.tsx inside the site's own layout. */
export default function Missing() {
  notFound();
}
