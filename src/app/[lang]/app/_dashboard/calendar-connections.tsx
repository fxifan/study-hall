"use client";

import { useState, useTransition } from "react";
import { useCopyText } from "@/components/report-cards";
import { setCalendarFeed } from "../dashboard-actions";
import { primaryButton, secondaryButton } from "./ui";

/**
 * Calendar connections. What works today is a private subscription link (an iCalendar feed):
 * Apple Calendar, Google Calendar and Outlook subscribe to it and show the tutor's lessons, updating
 * when lessons are added, rescheduled or cancelled. It's one-way, and calendar apps refresh it on
 * their own schedule. Two-way Google sync (seeing your other events here) isn't built; it's shown
 * as such, with no button.
 */
export function CalendarConnections({ feedUrl, lastFetched }: { feedUrl: string | null; lastFetched: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copyState, copy] = useCopyText();
  const run = (on: boolean) =>
    start(async () => {
      const r = await setCalendarFeed(on);
      setMessage(r.ok ? { tone: "ok", text: r.message ?? "Done." } : { tone: "error", text: r.error });
    });
  const webcal = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? "";
  const google = feedUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : "";

  return (
    <section aria-labelledby="connections-title" className="dash-card flex flex-col gap-3 p-4 sm:p-5">
      <header>
        <span className="dash-label">Sync</span>
        <h2 id="connections-title" className="text-xl font-medium">
          Your calendars
        </h2>
        <p className="text-sm text-ink-soft">Show your lessons in the calendar you already use.</p>
      </header>

      <div className="dash-inset flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Apple, Google or Outlook calendar</h3>
          <span className={`dash-pill shrink-0 px-2 py-0.5 text-xs ${feedUrl ? "dash-pill--accent" : ""}`}>
            {feedUrl && <span className="dash-dot" aria-hidden="true" />}
            {feedUrl ? "Link on" : "Not set up"}
          </span>
        </div>
        {feedUrl ? (
          <>
            <p className="text-sm text-ink-soft">
              {lastFetched ? `Last checked by a calendar app ${lastFetched}.` : "Not checked by a calendar app yet. Add it below."}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <a className={primaryButton} href={webcal}>
                Add to Apple Calendar
              </a>
              <a className={secondaryButton} href={google} target="_blank" rel="noreferrer">
                Add to Google Calendar ↗
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => copy(feedUrl)}>
                {copyState === "copied" ? "Link copied" : copyState === "failed" ? "Couldn't copy" : "Copy link (Outlook, other apps)"}
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                disabled={pending}
                onClick={() => window.confirm("Make a new link? Calendars using the old one will stop updating.") && run(true)}
              >
                Reset link
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" disabled={pending} onClick={() => window.confirm("Turn off the calendar link?") && run(false)}>
                Turn off
              </button>
            </div>
            <p className="text-xs text-ink-faint">
              One-way: lessons you add, move or cancel here show up there. Apple checks about hourly; Google can take up to a day. Keep the link
              private: anyone with it can see your lesson times and students&apos; first names.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">Get a private link your calendar app subscribes to. New, moved and cancelled lessons update there automatically.</p>
            <button type="button" className={primaryButton} disabled={pending} onClick={() => run(true)}>
              {pending ? "Setting up…" : "Set up calendar link"}
            </button>
          </>
        )}
      </div>

      <div className="dash-inset flex flex-col gap-1 border-dashed bg-transparent p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-ink-soft">Two-way Google Calendar sync</h3>
          <span className="dash-pill shrink-0 px-2 py-0.5 text-xs text-ink-faint">Not available yet</span>
        </div>
        <p className="text-sm text-ink-faint">Seeing your other events here (to spot clashes) needs a direct Google connection. It&apos;s planned, not built.</p>
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-pen" : "text-ink-soft"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
