"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTopRank, nextRank, rankByTier } from "@/lib/social/ranks";
import { acknowledgeRankUp, type PromotionView } from "./actions";
import { RankBadge } from "./rank-badge";

/** Promotions shown in this tab already (a refresh starts empty; the server ack covers that). */
const shownHere = new Set<string>();
const SEEN_KEY = (id: string) => `edumi:rank-seen:${id}`;

/**
 * The rank-up celebration (docs/study-ranks.md). Shown only for a promotion the server has
 * recorded for the signed-in student, once: the first tab to take a Web Lock for the promotion
 * shows it, a local "seen" mark stops other tabs and refreshes, and dismissing acknowledges it on
 * the server (which also clears earlier unseen promotions).
 *
 * Motion (Web Animations API, about one second): the badge rises from 60% with a slight turn and
 * settles with a small overshoot, a soft ring in the tier colour spreads behind it once, then
 * "Rank up!" and the rank name slide in. Master Mind and Grandmaster Genius add a second ring and
 * eight sparks. Nothing flashes or loops; there's no sound. With reduced motion everything appears
 * at once, still and complete. Esc, the close button and the backdrop all dismiss it.
 */
export function RankUpCelebration({ promotion, onDone }: { promotion: PromotionView; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const releaseLock = useRef<() => void>(() => {});
  const dialog = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const ring2 = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const to = rankByTier(promotion.toTier);
  const next = nextRank(to);
  const top = isTopRank(to);

  // Claim the celebration for this tab.
  useEffect(() => {
    let cancelled = false;
    const seen = () => {
      try {
        return localStorage.getItem(SEEN_KEY(promotion.id)) === "1";
      } catch {
        return false;
      }
    };
    if (shownHere.has(promotion.id) || seen()) {
      void acknowledgeRankUp(promotion.id);
      return;
    }
    const show = () => {
      if (cancelled || shownHere.has(promotion.id) || seen()) return false;
      shownHere.add(promotion.id);
      returnFocus.current = document.activeElement;
      setOpen(true);
      return true;
    };
    if ("locks" in navigator) {
      navigator.locks.request(`edumi-rank-${promotion.id}`, { ifAvailable: true }, (lock) => {
        if (!lock || !show()) return undefined;
        // Hold the lock while the dialog is open, so another tab can't show it at the same time.
        return new Promise<void>((resolve) => (releaseLock.current = resolve));
      });
    } else {
      show();
    }
    return () => {
      cancelled = true;
    };
  }, [promotion.id]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY(promotion.id), "1");
    } catch {
      /* private mode: the server ack still applies */
    }
    setOpen(false);
    releaseLock.current();
    void acknowledgeRankUp(promotion.id);
    if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    onDone?.();
  }, [promotion.id, onDone]);

  // Choreography, focus and Esc.
  useEffect(() => {
    if (!open) return;
    button.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialog.current) {
        const items = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animations: Animation[] = [];
    if (!reduce && typeof Element.prototype.animate === "function") {
      const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
      const go = (el: HTMLElement | null, frames: Keyframe[], o: KeyframeAnimationOptions) => el && animations.push(el.animate(frames, { fill: "both", ...o }));
      go(dialog.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      go(
        badge.current,
        [
          { transform: "scale(0.6) rotate(-8deg)", opacity: 0 },
          { transform: "scale(1.07) rotate(2deg)", opacity: 1, offset: 0.62 },
          { transform: "scale(1) rotate(0deg)", opacity: 1 },
        ],
        { duration: top ? 820 : 650, delay: 80, easing: ease },
      );
      go(ring.current, [{ transform: "scale(0.55)", opacity: 0.5 }, { transform: "scale(1.55)", opacity: 0 }], { duration: 760, delay: 200, easing: "ease-out" });
      if (top) go(ring2.current, [{ transform: "scale(0.55)", opacity: 0.4 }, { transform: "scale(1.9)", opacity: 0 }], { duration: 900, delay: 420, easing: "ease-out" });
      go(text.current, [{ transform: "translateY(10px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, delay: top ? 520 : 400, easing: ease });
      if (top && sparks.current) {
        [...sparks.current.children].forEach((el, i) => {
          const a = (i / 8) * Math.PI * 2;
          go(
            el as HTMLElement,
            [
              { transform: "translate(0, 0) scale(0.4)", opacity: 0 },
              { transform: `translate(${Math.cos(a) * 70}px, ${Math.sin(a) * 70}px) scale(1)`, opacity: 1, offset: 0.5 },
              { transform: `translate(${Math.cos(a) * 96}px, ${Math.sin(a) * 96}px) scale(0.6)`, opacity: 0 },
            ],
            { duration: 900, delay: 380, easing: "ease-out" },
          );
        });
      }
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      animations.forEach((a) => a.cancel());
    };
  }, [open, close, top]);

  if (!open) return null;
  return (
    <div className="theme-tiles fixed inset-0 z-50 grid place-items-center bg-[rgba(31,35,38,0.45)] p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rank-up-title"
        aria-describedby="rank-up-desc"
        className="relative flex w-full max-w-sm flex-col items-center gap-4 overflow-hidden rounded-3xl bg-sheet px-6 pt-10 pb-6 text-center shadow-xl"
      >
        <div className="relative grid h-40 w-40 place-items-center" aria-hidden="true">
          <div ref={ring} className="absolute inset-0 rounded-full opacity-0" style={{ background: `radial-gradient(closest-side, ${to.color}66, ${to.color}00)` }} />
          {top && <div ref={ring2} className="absolute inset-0 rounded-full opacity-0" style={{ boxShadow: `0 0 0 6px ${to.color}55` }} />}
          {top && (
            <div ref={sparks} className="absolute top-1/2 left-1/2">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="absolute -mt-1 -ml-1 h-2 w-2 rotate-45 rounded-[2px] opacity-0" style={{ background: to.color }} />
              ))}
            </div>
          )}
          <div ref={badge} className="relative">
            <RankBadge rank={to} size={136} labelled={false} />
          </div>
        </div>
        <div ref={text} className="flex flex-col gap-1">
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">Rank up!</p>
          <h2 id="rank-up-title" className="text-2xl font-semibold tracking-tight">
            {to.name}
          </h2>
          <p id="rank-up-desc" className="text-sm text-ink-soft">
            You reached {to.name} with {promotion.points} points.
            {next ? ` Next up: ${next.name} at ${next.min}.` : " That is the top rank."}
          </p>
        </div>
        <p className="sr-only" role="status">
          Rank up! You&apos;re now {to.name}.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row-reverse">
          <button ref={button} type="button" onClick={close} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper">
            Nice!
          </button>
          <Link
            href="/student/ranks"
            onClick={close}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-rule px-5 text-sm font-medium text-ink no-underline"
          >
            See all ranks
          </Link>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-paper-deep">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
