import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

/** The site's 404 page, in the Tiles look, with ways back. */
export default function NotFound() {
  return (
    <div className="theme-tiles flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-16" lang="en">
        <Wordmark className="text-base" />
        <p className="w-fit rounded-full bg-[var(--tiles-sage-soft)] px-3 py-1 text-sm font-semibold text-[var(--tiles-sage-strong)]">404</p>
        <h1 className="text-4xl font-extrabold tracking-tight">We can&apos;t find that page.</h1>
        <p className="text-ink-soft">The link may be old or mistyped. Try one of these instead.</p>
        <nav aria-label="Ways back" className="flex flex-wrap gap-2">
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium text-paper no-underline">
            Edumi home
          </Link>
          <Link href="/study_hall" className="inline-flex h-11 items-center rounded-full border border-rule bg-sheet px-5 font-medium no-underline">
            Study Hall
          </Link>
          <Link href="/tutors" className="inline-flex h-11 items-center rounded-full border border-rule bg-sheet px-5 font-medium no-underline">
            For tutors
          </Link>
          <Link href="/login" className="inline-flex h-11 items-center rounded-full border border-rule bg-sheet px-5 font-medium no-underline">
            Log in
          </Link>
        </nav>
      </main>
    </div>
  );
}
