"use client";

import { useEffect } from "react";

// Scroll reveals (comprehensive brief §8): one motion, a short rise, used for three kinds of target.
// Section headings rise in order; content blocks rise as a whole; items in a grid rise one after
// another (the CSS also draws the rule above steps and safety items). Never single paragraphs.
const HEADINGS = ".sec-mark, .sec-body > h2, .sec-body > .intro, .price-grid > div > h2, .price-grid > div > .intro";
const BLOCKS = ".tl, .tutor-body, .scope, .rules-sheet, .checks, .compare, .faq, .report-grid > div:last-child, .cover-foot";
const ITEMS = ".steps > li, .safety > li, .plans > .label, .is-grid > div";
const MAX_STAGGER = 5;

/**
 * Small progressive enhancements from the design: start the pen-stroke reveals (.draw -> .go) as
 * sections scroll into view, reveal section content as it arrives (.rv -> .in), and draw a hairline
 * under the sticky nav once the page scrolls. Renders nothing. The sample report manages its own
 * reveal. Without JavaScript or IntersectionObserver, or with reduced motion, nothing is hidden.
 */
export function LandingEffects() {
  useEffect(() => {
    // The hero is already on screen (and can be taller than a phone), so it starts straight away.
    document.querySelector(".landing .hero.draw")?.classList.add("go");
    const targets = [...document.querySelectorAll<HTMLElement>(".landing .draw:not(.hero):not([data-own-reveal])")];
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("go");
          io.unobserve(entry.target);
        }),
      { threshold: 0.35 },
    );
    targets.forEach((el) => io.observe(el));

    const stopReveals = revealOnScroll();

    const nav = document.querySelector(".landing .nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      stopReveals();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}

function revealOnScroll(): () => void {
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }
  const targets: HTMLElement[] = [];
  for (const section of document.querySelectorAll<HTMLElement>(".landing .sec:not(.hero):not(.end)")) {
    section.querySelectorAll<HTMLElement>(HEADINGS).forEach((el, i) => {
      el.style.setProperty("--rv", String(i));
      targets.push(el);
    });
    section.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => targets.push(el));
    section.querySelectorAll<HTMLElement>(ITEMS).forEach((el) => {
      const index = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
      el.style.setProperty("--rv", String(Math.min(index, MAX_STAGGER)));
      targets.push(el);
    });
  }

  // Anything already on screen is marked shown in the same step, so it never flickers out and back.
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }),
    // Threshold 0 so tall blocks still trigger; the margin waits until they're 10% up the screen.
    { threshold: 0, rootMargin: "0px 0px -10% 0px" },
  );
  for (const el of targets) {
    const box = el.getBoundingClientRect();
    const onScreen = box.top < window.innerHeight && box.bottom > 0;
    el.classList.add("rv", ...(onScreen ? ["in"] : []));
    if (!onScreen) io.observe(el);
  }
  return () => io.disconnect();
}
