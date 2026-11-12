import { MAX_STUDENT_MESSAGE } from "@/lib/social/assistant";
import { startChat } from "./assistant-actions";
import { GenerateButton } from "./generate-button";

/**
 * Home's "Stuck on something?" tile. With the add-on it starts a chat straight away; without, the
 * question carries over to the Ask page, which offers the add-on.
 */
export function AskTile({ on, askHref }: { on: boolean; askHref: string }) {
  return (
    <section aria-label="Ask EduMi AI" className="flex flex-col gap-3 rounded-2xl bg-[var(--tiles-sage-soft)] p-5 text-[var(--tiles-sage-ink)]" data-testid="ask-tile">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ink">Stuck on something?</h2>
        <p className="text-sm">Ask EduMi AI. It explains at your level, then gives you one to try.</p>
      </div>
      <form action={on ? startChat : askHref} method={on ? undefined : "get"} className="flex gap-2">
        <input type="hidden" name="source" value="ask" />
        <label htmlFor="home-ask" className="sr-only">
          Your question
        </label>
        <input
          id="home-ask"
          name={on ? "message" : "q"}
          required
          maxLength={MAX_STUDENT_MESSAGE}
          placeholder="e.g. why do you change the sign when…"
          className="h-11 min-w-0 flex-1 rounded-full bg-sheet px-4 text-sm text-ink"
        />
        {on ? (
          <GenerateButton label="Ask" />
        ) : (
          <button className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper">Ask</button>
        )}
      </form>
    </section>
  );
}
