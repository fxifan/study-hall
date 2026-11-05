/**
 * A mailto: link that opens the tutor's own email app with the message filled in. Used while
 * Edumi has no verified sending domain (src/lib/email/send.ts, tutorEmailMode).
 * Some email apps cut very long links; reports are short, so keep bodies under ~1,800 characters.
 */
export const MAILTO_SAFE_LENGTH = 1800;

export function mailtoHref({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const enc = (v: string) => encodeURIComponent(v.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${enc(subject)}&body=${enc(body)}`;
}
