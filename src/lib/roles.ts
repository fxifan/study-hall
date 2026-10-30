export const ROLES = ["parent", "student", "proctor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HOME: Record<Role, string> = {
  parent: "/parent",
  student: "/student",
  proctor: "/proctor",
  admin: "/admin",
};

/** Admins can also use the supervisor pages, for the sessions they supervise or tutor themselves. */
export function canEnterArea(role: Role, area: Role): boolean {
  return area === role || (role === "admin" && area === "proctor");
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** The role whose area a path belongs to (/parent/student/1 -> "parent"), or null for public paths. */
export function roleForPath(pathname: string): Role | null {
  return ROLES.find((role) => pathname === ROLE_HOME[role] || pathname.startsWith(`${ROLE_HOME[role]}/`)) ?? null;
}
