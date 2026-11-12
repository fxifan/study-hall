import Link from "next/link";
import { AI_ADDON_PRICE_LABEL } from "@/lib/social/assistant";
import type { AiAccess } from "@/lib/social/assistant-server";
import { addAiAddonAction } from "./assistant-actions";
import { card, primaryBtn, secondaryBtn } from "./shell";

/** What EduMi AI adds, on the Ask page and the plan page. */
export const AI_ADDON_FEATURES = [
  "Ask about anything you're studying, any time",
  "Explanations at your year level, then a question to try",
  "Hints before answers, and full solutions when you're checking",
  '"Help me understand my mistake" on every quiz you get marked',
];

/**
 * The A$2.99/month add-on offer. Students who pay for their own plan add it in one step (it goes
 * on the same subscription); everyone else is told what has to happen first.
 */
export function AiAddonOffer({ access, back, planHref }: { access: Exclude<AiAccess, { kind: "on" }>; back: "ask" | "plan"; planHref: string }) {
  return (
    <section className={`${card} flex flex-col gap-3`} data-testid="ai-addon-offer">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">EduMi AI</h2>
        <p>
          <span className="text-2xl font-medium">{AI_ADDON_PRICE_LABEL}</span>
          <span className="text-sm text-ink-soft">/month</span>
        </p>
      </div>
      <p className="text-sm text-ink-soft">An add-on to your Edumi plan: a study assistant that explains things step by step, then lets you have a go.</p>
      <ul className="list-disc pl-5 text-sm">
        {AI_ADDON_FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {access.kind === "available" ? (
        <form action={addAiAddonAction} className="flex flex-col gap-2">
          <input type="hidden" name="back" value={back} />
          <p className="text-sm text-ink-soft">
            {access.trial
              ? `Free while your trial lasts. Then ${AI_ADDON_PRICE_LABEL}/month on top of your plan, on the same card, until you remove it.`
              : `${AI_ADDON_PRICE_LABEL}/month on top of your plan, on the same card. This month is pro-rated on your next bill. Remove it any time.`}
          </p>
          <button className={`${primaryBtn} w-fit`}>Add EduMi AI · {AI_ADDON_PRICE_LABEL}/month</button>
        </form>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-ink-soft">
          <p>
            {access.kind === "parent" && "A parent pays for your plan, so they'll need to add EduMi AI. We don't charge their card from your account."}
            {access.kind === "studyhall" && "Your plan comes with your family's Study Hall subscription. EduMi AI for Study Hall families is coming soon."}
            {access.kind === "needs_card" && "Add a card to your Edumi plan first, then you can add EduMi AI."}
            {access.kind === "needs_plan" && "EduMi AI is an add-on to the Edumi student plan. Start your plan first."}
          </p>
          {(access.kind === "needs_card" || access.kind === "needs_plan") && (
            <Link href={planHref} className={`${secondaryBtn} w-fit no-underline`}>
              Go to your plan
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
