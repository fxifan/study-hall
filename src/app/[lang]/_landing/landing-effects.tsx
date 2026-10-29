"use client";

import { useEffect } from "react";

/**
 * Small progressive enhancements from the design: start the pen-stroke reveals (.draw -> .go) as
 * sections scroll into view, and draw a hairline under the sticky nav once the page scrolls.
 * Renders nothing. The sample report manages its own reveal.
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

    const nav = document.querySelector(".landing .nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
