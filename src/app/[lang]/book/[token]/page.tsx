import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { track } from "@/lib/events";
import { syncSeatCheckout } from "@/lib/social/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInZone } from "@/lib/time";
import { bookSeat } from "./actions";

export const metadata: Metadata = { title: "Book a Study Hall seat", robots: { index: false } };

export default function BookPage({ params, searchParams }: PageProps<"/[lang]/book/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12" lang="en">
      <Wordmark className="text-base" product="Study Hall" />
      <Suspense fallback={null}>
        <Book params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type Seat = {
  id: string;
  status: string;
  students: { first_name: string } | null;
  studyhall_bookings: { topic: string; price_cents: number; cancelled_at: string | null; sessions: { starts_at: string; ends_at: string; status: string; rooms: { name: string } | null } | null } | null;
};

/**
 * The parent booking view (student social brief, "Path to paid Study Hall"): the session's topic,
 * time, price and how supervision works. It never shows the group's messages, scores or boards.
 */
async function Book({ params, searchParams }: Pick<PageProps<"/[lang]/book/[token]">, "params" | "searchParams">) {
  const [{ token }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const admin = createAdminClient();
  const load = () =>
    admin
      .from("studyhall_seats")
      .select("id, status, students(first_name), studyhall_bookings(topic, price_cents, cancelled_at, sessions(starts_at, ends_at, status, rooms(name)))")
      .eq("token", token)
      .maybeSingle<Seat>();
  let { data: seat } = await load();
  if (!seat?.studyhall_bookings) notFound();
  if (typeof query.checkout === "string" && /^cs_[A-Za-z0-9_]+$/.test(query.checkout) && seat.status !== "paid") {
    if (await syncSeatCheckout(query.checkout, seat.id).catch(() => false)) {
      await track({ name: "studyhall_seat_paid", product: "study_hall", role: "parent", objectType: "studyhall_seat", objectId: seat.id, dedupeKey: `seat_paid:${seat.id}` });
      seat = (await load()).data ?? seat;
    }
  }
  const b = seat.studyhall_bookings!;
  const s = b.sessions;
  const name = seat.students?.first_name ?? "Your child";
  const unavailable = b.cancelled_at || !s || s.status === "cancelled" || Date.parse(s.starts_at) < new Date().getTime();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-medium tracking-tight">{seat.status === "paid" ? `${name}'s seat is booked` : `Book ${name}'s seat`}</h1>
      <section className="flex flex-col gap-1 rounded-lg border border-rule bg-sheet p-4">
        <p className="text-lg font-medium">{b.topic}</p>
        {s && (
          <p className="text-ink-soft">
            {formatInZone(s.starts_at, "EEEE d MMMM, h:mmaaa")} to {formatInZone(s.ends_at, "h:mmaaa")} (Melbourne time)
            {s.rooms ? ` · ${s.rooms.name}` : ""}
          </p>
        )}
        <p className="mt-2">
          <span className="text-2xl font-medium">A${(b.price_cents / 100).toFixed(0)}</span> <span className="text-ink-soft">for this one session</span>
        </p>
      </section>
      <section className="flex flex-col gap-2 text-sm text-ink-soft">
        <h2 className="text-base font-medium text-ink">How it works</h2>
        <p>{name} and their friends study together in a supervised online Study Hall. A tutor is on hand the whole time to answer questions the group flags.</p>
        <p>Students set goals at the start and the supervisor checks them at the end. The house rules apply, and each parent books their own child&apos;s seat.</p>
      </section>
      {seat.status === "paid" ? (
        <p className="rounded-md border border-success px-3 py-2">Paid. Stripe has emailed your receipt, and {name} will see the session on their Study Hall page.</p>
      ) : unavailable ? (
        <p className="rounded-md border border-rule px-3 py-2 text-ink-soft">This session isn&apos;t open for booking any more.</p>
      ) : (
        <form action={bookSeat.bind(null, token, locale)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Your email (for the receipt and report)
            <input name="email" type="email" required autoComplete="email" className="h-10 rounded-md border border-rule bg-paper px-3" />
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="rules" required className="mt-1" />
            <span>
              I&apos;m {name}&apos;s parent or guardian and I agree to the <a href={localizePath("/legal/house-rules", locale)}>house rules</a>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="privacy" required className="mt-1" />
            <span>
              I&apos;ve read the <a href={localizePath("/legal/privacy", locale)}>privacy and child safety notice</a>.
            </span>
          </label>
          {query.error && <p className="text-sm text-pen">Add your email and tick both boxes.</p>}
          <button className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 font-medium text-paper">Pay A$40 and book</button>
        </form>
      )}
    </div>
  );
}
