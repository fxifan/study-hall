"use client";

import { useEffect } from "react";

/** Section ids that belonged to the Study Hall page when it lived at "/". */
const STUDY_HALL_ANCHORS = new Set(["how", "session", "report", "tutoring", "rules", "safety", "pricing", "faq"]);

const EASE_INOUT = "cubic-bezier(0.65, 0, 0.35, 1)";
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Runs fn(eased progress) every frame for ms, then done(). */
function tween(ms: number, fn: (e: number) => void, done?: () => void) {
  const start = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    fn(easeInOut(p));
    if (p < 1) requestAnimationFrame(frame);
    else done?.();
  };
  requestAnimationFrame(frame);
}

/**
 * Home page behaviour, all progressive enhancement:
 *  - Old links like "/#pricing" (from when Study Hall was the home page) go to /study_hall#pricing.
 *  - Scroll reveals: adds .js to the page, then .in to each [data-rv] element as it enters view.
 *    Without JavaScript, or with reduced motion, nothing is ever hidden (see home.css).
 *  - Motion moments (UX motion principles, Nov 2026): the hero goal ring counts up and "You" climbs
 *    past Ava on the leaderboard; the in-app clock ticks; bento tiles tilt toward the pointer.
 *    The markup always holds a valid state, so a skipped animation never leaves wrong numbers.
 */
export function HomeEffects({ studyHallHref }: { studyHallHref: string }) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (STUDY_HALL_ANCHORS.has(id)) {
      window.location.replace(`${studyHallHref}#${id}`);
      return;
    }
    const root = document.querySelector<HTMLElement>(".home");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    const hero = (stage: HTMLElement) => {
      const ring = stage.querySelector<HTMLElement>("[data-ring]");
      const label = ring?.firstElementChild;
      if (ring && label) {
        // Keep the real value on the element, so a second run (React Strict Mode) still knows it.
        ring.dataset.target ??= ring.style.getPropertyValue("--p");
        const target = parseFloat(ring.dataset.target) || 0;
        ring.style.setProperty("--p", "0");
        label.textContent = "0%";
        later(400, () =>
          tween(1400, (e) => {
            ring.style.setProperty("--p", String(target * e));
            label.textContent = `${Math.round(target * e)}%`;
          }),
        );
      }
      const you = stage.querySelector<HTMLElement>('[data-row="you"]');
      const rival = stage.querySelector<HTMLElement>('[data-row="rival"]');
      const mins = you?.querySelector<HTMLElement>("[data-min]");
      const nudge = you?.querySelector<HTMLElement>("[data-passed]");
      if (!you || !rival || !mins || !nudge) return;
      later(1300, () =>
        tween(
          1800,
          (e) => {
            mins.textContent = `${Math.round(45 * e)}m`;
          },
          () => {
            // Swap the rows with transforms only (React owns the DOM order): You arcs up, Ava drops.
            const d = you.offsetTop - rival.offsetTop;
            const opts = { duration: 620, easing: EASE_INOUT, fill: "forwards" as const };
            you.animate(
              [
                { transform: "none" },
                { transform: `translate(-10px, ${-d / 2}px) scale(1.03)`, boxShadow: "0 10px 24px rgba(59, 86, 71, 0.2)" },
                { transform: `translateY(${-d}px)` },
              ],
              opts,
            );
            rival.animate([{ transform: "none" }, { transform: `translateY(${d}px)` }], opts);
            const [a, b] = [you, rival].map((r) => r.querySelector(".home-rank"));
            if (a && b) [a.textContent, b.textContent] = [b.textContent, a.textContent];
            later(620, () => {
              you.classList.add("home-landed");
              nudge.textContent = nudge.dataset.passed ?? nudge.textContent;
              nudge.classList.add("home-won");
              const n = nudge.getBoundingClientRect();
              const r = you.getBoundingClientRect();
              for (let i = 0; i < 8; i++) {
                const s = document.createElement("i");
                s.className = "home-spark";
                s.setAttribute("aria-hidden", "true");
                s.style.setProperty("--a", `${i * 45}deg`);
                s.style.left = `${n.left - r.left + n.width / 2 - 3}px`;
                s.style.top = `${n.top - r.top + n.height / 2 - 3}px`;
                you.appendChild(s);
                later(800, () => s.remove());
              }
            });
          },
        ),
      );
    };

    const app = (el: HTMLElement) => {
      // The clock changes instantly every second: frequent updates get no animation.
      const clock = el.querySelector<HTMLElement>("[data-tick]");
      const m = clock?.textContent?.trim().match(/^(\d+):(\d+)$/);
      if (!clock || !m) return;
      let secs = Number(m[1]) * 60 + Number(m[2]);
      timers.push(
        window.setInterval(() => {
          secs++;
          clock.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
        }, 1000),
      );
    };

    const reveal = (el: HTMLElement) => {
      el.classList.add("in");
      if (el.matches(".home-stage")) hero(el);
      if (el.matches(".home-app")) app(el);
      // Once the reveal has finished, cards switch to their quicker hover transition.
      if (el.matches(".home-bento-tile, .home-product")) later(1200, () => el.classList.add("home-settled"));
    };

    const items = [...root.querySelectorAll<HTMLElement>("[data-rv]")];
    // Anything already on screen is shown at once, so nothing visible ever blinks out.
    for (const el of items) if (el.getBoundingClientRect().top < window.innerHeight) reveal(el);
    root.classList.add("js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          reveal(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of items) if (!el.classList.contains("in")) io.observe(el);

    // Bento tiles tilt toward a fine pointer.
    const tiles = window.matchMedia("(pointer: fine)").matches ? [...root.querySelectorAll<HTMLElement>(".home-bento-tile")] : [];
    const onMove = (e: PointerEvent) => {
      const t = e.currentTarget as HTMLElement;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
      t.style.setProperty("--rx", `${(0.5 - (e.clientY - r.top) / r.height) * 8}deg`);
    };
    const onLeave = (e: PointerEvent) => {
      const t = e.currentTarget as HTMLElement;
      t.style.setProperty("--rx", "0deg");
      t.style.setProperty("--ry", "0deg");
    };
    for (const t of tiles) {
      t.addEventListener("pointermove", onMove);
      t.addEventListener("pointerleave", onLeave);
    }

    return () => {
      io.disconnect();
      for (const t of timers) {
        window.clearTimeout(t);
        window.clearInterval(t);
      }
      for (const t of tiles) {
        t.removeEventListener("pointermove", onMove);
        t.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [studyHallHref]);
  return null;
}
