/**
 * `tutor` is an independent tutor using the session-report product at /app
 * (docs/tutor-reports-spec.md). Edumi's own room tutors are `proctor` accounts.
 */
export const ROLES = ["parent", "student", "proctor", "admin", "tutor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HOME: Record<Role, string> = {
  parent: "/parent",
  student: "/student",
  proctor: "/proctor",
  admin: "/admin",
  tutor: "/app",
};

/**
 * Admins can also use the supervisor pages (the sessions they supervise or tutor themselves), the
 * tutor app (their own tutor workspace) and the student app (the "Student view" preview, with
 * their own preview student profile; see src/lib/social/preview.ts).
 */
export function canEnterArea(role: Role, area: Role): boolean {
  return area === role || (role === "admin" && (area === "proctor" || area === "tutor" || area === "student"));
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** The role whose area a path belongs to (/parent/student/1 -> "parent"), or null for public paths. */
export function roleForPath(pathname: string): Role | null {
  return ROLES.find((role) => pathname === ROLE_HOME[role] || pathname.startsWith(`${ROLE_HOME[role]}/`)) ?? null;
}
