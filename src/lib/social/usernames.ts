/**
 * Edumi usernames (docs/friends.md): how friends find each other. Unique, 3 to 20 characters of
 * lowercase letters, numbers, dots and underscores, not starting or ending with a dot or
 * underscore, no double dots. Matches the database check on students.username.
 */
export const USERNAME_CHANGE_DAYS = 30;

const FORMAT = /^[a-z0-9._]{3,20}$/;

/** Words a username can't contain: staff-looking names and a short list of slurs and obscenities. */
const BLOCKED = [
  "admin", "edumi", "support", "moderator", "official", "staff", "teacher", "tutor", "system",
  // Slurs and obscenities that don't hide inside common names (so not "shit" in Ishita).
  "fuck", "cunt", "bitch", "slut", "whore", "nigg", "faggot", "porn", "nazi", "pussy",
];

/** Lowercase and strip a leading @, so "@Mia.Studies " finds mia.studies. */
export function normaliseUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

/** Why a username can't be used, or null when it's fine. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3 || username.length > 20) return "Use 3 to 20 characters.";
  if (!FORMAT.test(username)) return "Use lowercase letters, numbers, dots and underscores only.";
  if (/^[._]|[._]$/.test(username)) return "Start and end with a letter or number.";
  if (username.includes("..")) return "No double dots.";
  const bare = username.replace(/[._0-9]/g, "");
  if (BLOCKED.some((w) => bare.includes(w))) return "Pick a different username.";
  return null;
}

/** Adults (18+) and under-18s can only become friends if they already share a group. */
export function isAdult(student: { birth_year: number | null; birth_month: number | null }, now = new Date()): boolean {
  if (!student.birth_year) return false; // unknown counts as under 18, the safer side
  const month = student.birth_month ?? 12; // unknown month: assume the latest, so never older than they are
  const years = now.getFullYear() - student.birth_year - (now.getMonth() + 1 < month ? 1 : 0);
  return years >= 18;
}
