import { CONTACT_EMAIL } from "@/lib/contact";
import { renderEmail, type EmailBlock, type EmailSection, type RenderedEmail } from "./bilingual";

/** The personal login or welcome email (src/lib/email/login.ts). English only. */
export function loginEmail(input: { first: string; lines: string[]; url: string; welcome: boolean }): RenderedEmail {
  const hello = input.first ? `Hi ${input.first},` : "Hi,";
  const blocks: EmailBlock[] = [
    { kind: "heading", text: input.welcome ? "Welcome to Edumi" : "Your Edumi login link" },
    { kind: "p", text: hello },
    ...input.lines.map((text): EmailBlock => ({ kind: "p", text })),
    { kind: "button", label: input.welcome ? "Open Edumi" : "Log in", url: input.url },
    { kind: "small", text: "This link works once and expires in an hour. If you didn't ask for it, you can ignore this email." },
  ];
  const section: EmailSection = {
    label: "",
    lang: "en",
    colon: ": ",
    blocks,
    footer: `Questions? Email ${CONTACT_EMAIL}. Edumi is run by Feifan Wu, a sole trader.`,
  };
  const subject = input.welcome ? `${input.first ? `${input.first}, welcome` : "Welcome"} to Edumi` : `${input.first ? `${input.first}, here's` : "Here's"} your Edumi login link`;
  return renderEmail({ subject, sections: [section] });
}

