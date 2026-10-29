import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Placeholder. The real landing page (design/landing.html) is ported in Phase 1.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="font-mono text-xs tracking-widest text-pen uppercase">VCE · Mon–Thu 4–8pm</p>
      <h1 className="text-5xl font-medium tracking-tight">Study Hall</h1>
      <p className="text-lg text-ink-soft">
        Supervised online study for VCE students, with a short report to parents every night.
      </p>
      <div>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Log in
        </Link>
      </div>
    </main>
  );
}
