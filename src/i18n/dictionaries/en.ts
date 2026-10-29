/**
 * English UI strings. The source of truth for the dictionary's shape: zh.ts must match it.
 * {placeholders} are filled with fill() from src/i18n/fill.ts. Date patterns are date-fns tokens.
 * The landing page's copy is long, so it lives in landing.en.ts.
 */
import { landingEn } from "./landing.en";

export const en = {
  meta: {
    description: "Supervised online study for VCE students, Monday to Thursday 4–8pm.",
  },
  common: {
    loading: "Loading…",
    logOut: "Log out",
    phase: "Phase {n}",
  },
  roles: { parent: "Parent", student: "Student", proctor: "Proctor", admin: "Admin" },
  studentStatus: { invited: "invited", active: "active", paused: "paused", cancelled: "cancelled" },
  formats: { longDate: "EEEE d MMMM", time: "h:mmaaa" },
  landing: landingEn,
  login: {
    title: "Log in",
    description: "We'll email you a link. No password needed.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    submit: "Email me a login link",
    sending: "Sending…",
    sent: "If {email} has a Study Hall account, a login link is on its way. It expires in an hour.",
    errors: {
      invalid_email: "Enter a valid email address.",
      rate_limited: "Too many login emails. Wait a minute and try again.",
      send_failed: "We couldn't send the link. Try again shortly.",
    },
    linkErrors: {
      link: "That login link has expired or was already used. Ask for a new one below.",
      "no-profile": "Your account isn't set up yet. Contact Study Hall if this keeps happening.",
    },
  },
  parent: {
    heading: "Your students",
    empty: "No students yet.",
    yearStatus: "Year {year} · {status}",
    reportsSoon: "Nightly reports and attendance history will appear here.",
  },
  student: {
    greeting: "Hi {name}",
    greetingFallback: "Hi there",
    year: "Year {year}",
    sessionSoon: "Today's session, your goals, the Join button and the block timer will appear here.",
  },
  proctor: {
    heading: "Today's sessions",
    melbourneTime: "Melbourne time",
    room: "Room",
    empty: "No sessions assigned to you today.",
    rosterSoon: "The live roster, focus flags and help queue open from each session.",
  },
  admin: {
    heading: "Overview",
    students: "Students",
    rooms: "Rooms",
    plans: "Plans",
    perInterval: { week: "week" },
    inactive: "inactive",
    manageSoon: "Rooms, schedule, plans and proctor (WWCC) management.",
  },
};

export type Dictionary = typeof en;
