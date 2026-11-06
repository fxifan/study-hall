/** Students 13 and over sign themselves up; younger students are added by a parent. */
export const MIN_SELF_SIGNUP_AGE = 13;

/**
 * Age in whole years from birth month and year. Without a birth day we assume the last day of the
 * month (the youngest the student could be), so nobody under 13 slips through.
 */
export function ageFrom(birthYear: number, birthMonth: number, today: Date): number {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  const lastDay = new Date(Date.UTC(birthYear, birthMonth, 0)).getUTCDate();
  let age = y - birthYear;
  if (m < birthMonth || (m === birthMonth && d < lastDay)) age--;
  return age;
}

export function canSelfSignUp(birthYear: number, birthMonth: number, today = new Date()): boolean {
  return ageFrom(birthYear, birthMonth, today) >= MIN_SELF_SIGNUP_AGE;
}
