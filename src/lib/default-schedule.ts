/**
 * The default weekly schedule (spec §12), for marketing copy only: the landing page's "next session"
 * line. The app itself reads `schedules` and `sessions`, which also know about cancelled dates.
 * Keep in step with scripts/seed.ts.
 */
export const DEFAULT_SCHEDULE = {
  isoDays: [1, 2, 3, 4], // Monday–Thursday
  startMinutes: 16 * 60,
  endMinutes: 20 * 60,
  doorsOpenMinutes: 10, // goals open this long before the start
} as const;
