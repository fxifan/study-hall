/**
 * Reserved, never-deliverable domains (RFC 2606 / RFC 6761). Test and seed accounts use them, and
 * sending to them only burns the auth mailer's hourly quota (Supabase also rejects them).
 */
export function isReservedTestEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return (
    /\.(test|example|invalid|localhost)$/.test(domain) ||
    ["example.com", "example.net", "example.org"].includes(domain)
  );
}

/**
 * Supabase Auth answers 429 both for the per-address cooldown ("…only request this after 37
 * seconds") and for the project-wide hourly email quota. Tell them apart so the message is true.
 */
export function emailLimitKind(error: { status?: number; code?: string; message: string }): "cooldown" | "quota" | null {
  if (error.status !== 429 && error.code !== "over_email_send_rate_limit") return null;
  return /after \d+ seconds?/i.test(error.message) ? "cooldown" : "quota";
}
