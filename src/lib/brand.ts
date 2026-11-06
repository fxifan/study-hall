/**
 * Edumi brand (rebrand, Nov 2026). Every product name, tagline and domain comes from here, so the
 * brand can't drift between pages, emails and metadata.
 *
 * Edumi is the platform. Its two live products keep the names their users know:
 *   - Edumi Study Hall: supervised online study for secondary students and their families.
 *   - Edumi for Tutors: the tutor workspace (reports, invoices, lessons, AI resources).
 * Feature names reserved for later (naming only; nothing is built under them yet): Edumi AI,
 * Edumi Studio, Edumi Insights, Edumi Classroom.
 */
export const BRAND = {
  name: "Edumi",
  /** The wordmark is lowercase with a sage full stop. */
  wordmark: "edumi",
  domain: "edumi.app",
  url: "https://edumi.app",
  tagline: "Education, made intelligent.",
  description:
    "Edumi brings AI-powered teaching tools, lesson creation, student management and learning insights into one intelligent workspace.",
  products: {
    studyHall: "Edumi Study Hall",
    studyHallShort: "Study Hall",
    tutors: "Edumi for Tutors",
  },
  /** Tiles palette (site-wide from 7 Nov 2026); names kept from the first rebrand. */
  colors: {
    midnight: "#1F2326",
    indigo: "#3B5647",
    lavender: "#8EA596",
    lavenderSoft: "#DBE5DE",
    cloud: "#F1F1EC",
  },
} as const;
