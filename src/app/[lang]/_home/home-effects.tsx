"use client";

import { useEffect } from "react";

/** Section ids that belonged to the Study Hall page when it lived at "/". */
const STUDY_HALL_ANCHORS = new Set(["how", "session", "report", "tutoring", "rules", "safety", "pricing", "faq"]);

/**
 * Home page behaviour, all progressive enhancement:
 *  - Old links like "/#pricing" (from when Study Hall was the home page) go to /study_hall#pricing.
 *  - Scroll reveals: adds .js to the page, then .in to each [data-rv] element as it enters view.
 *    Without JavaScript, or with reduced motion, nothing is ever hidden (see home.css).
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
    const items = [...root.querySelectorAll<HTMLElement>("[data-rv]")];
    // Anything already on screen is shown at once, so nothing visible ever blinks out.
    for (const el of items) if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
    root.classList.add("js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of items) if (!el.classList.contains("in")) io.observe(el);
    return () => io.disconnect();
  }, [studyHallHref]);
  return null;
}
