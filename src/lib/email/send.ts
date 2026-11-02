import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isReservedTestEmail } from "@/lib/email";
import type { RenderedEmail } from "./bilingual";

/**
 * Email delivery adapter (docs/tutor-reports-spec.md §2): Resend's HTTP API, no SDK. Swap the
 * vendor here.
 *
 * From: REPORTS_FROM_EMAIL's address with the tutor's name as the display name, and Reply-To set to
 * the tutor, so parents' replies reach the tutor (spec §11.3: tutor-domain sending is later).
 *
 * Without RESEND_API_KEY (local dev), or for reserved test domains (*.test, example.com), nothing is
 * sent: the email is written to email-previews/outbox/ and reported as a preview.
 */
export type Attachment = { filename: string; content: Buffer; contentType: string };
export type SendResult = { delivered: true; id: string } | { delivered: false; preview: string };

export class EmailError extends Error {}

function fromHeader(displayName?: string): string {
  const configured = process.env.REPORTS_FROM_EMAIL ?? "Study Hall <reports@example.com>";
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured.trim();
  if (!displayName) return configured;
  // Quote the name; strip characters that could break the header.
  return `"${displayName.replace(/["\\\r\n<>]/g, "").slice(0, 70)} via Study Hall" <${address}>`;
}

export async function sendEmail({
  to,
  email,
  fromName,
  replyTo,
  attachments = [],
}: {
  to: string;
  email: RenderedEmail;
  fromName?: string;
  replyTo?: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || isReservedTestEmail(to)) {
    if (process.env.VERCEL_ENV === "production" && !apiKey) throw new EmailError("Email isn't set up (RESEND_API_KEY).");
    const dir = path.join(process.cwd(), "email-previews", "outbox");
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${to.replace(/[^a-z0-9@.]/gi, "_")}`;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${name}.html`), email.html);
      await writeFile(path.join(dir, `${name}.txt`), `To: ${to}\nSubject: ${email.subject}\n\n${email.text}`);
      for (const a of attachments) await writeFile(path.join(dir, `${name}-${a.filename}`), a.content);
    } catch {
      // Read-only filesystem (e.g. a preview deployment): nothing to keep.
    }
    return { delivered: false, preview: name };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(fromName),
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) }
        : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new EmailError(`The email service refused the message (${response.status}).`);
  const body = (await response.json()) as { id?: string };
  return { delivered: true, id: body.id ?? "" };
}
