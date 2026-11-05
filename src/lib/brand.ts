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
  /** The wordmark is lowercase with a lavender full stop. */
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
  colors: {
    midnight: "#171A35",
    indigo: "#35366F",
    lavender: "#A99AFF",
    lavenderSoft: "#EAE6FF",
    cloud: "#F8F9FC",
  },
} as const;
