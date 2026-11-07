import { USERNAME_CHANGE_DAYS } from "@/lib/social/usernames";
import { setUsername } from "./friend-actions";
import { card, primaryBtn } from "./shell";

/** Pick or change the username friends add you by (docs/friends.md). */
export function UsernameCard({ current, back, error, saved }: { current: string | null; back: "/student/me" | "/student/friends"; error?: string | null; saved?: boolean }) {
  return (
    <section className={`${card} flex flex-col gap-3`} aria-labelledby="username-heading">
      <h2 id="username-heading" className="font-medium">
        {current ? "Your username" : "Pick a username"}
      </h2>
      <p className="text-sm text-ink-soft">
        {current
          ? `Friends add you with @${current}. You can change it once every ${USERNAME_CHANGE_DAYS} days.`
          : "Friends add you with this. Don't use your full name or school."}
      </p>
      <form action={setUsername} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="back" value={back} />
        <label className="flex h-10 flex-1 items-center rounded-md border border-rule bg-paper px-3 focus-within:border-ink">
          <span className="text-ink-faint" aria-hidden="true">
            @
          </span>
          <span className="sr-only">Username</span>
          <input
            name="username"
            required
            minLength={3}
            maxLength={21}
            defaultValue={current ?? ""}
            placeholder="mia.studies"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="@?[A-Za-z0-9._]{3,20}"
            className="h-full flex-1 bg-transparent outline-none"
          />
        </label>
        <button className={primaryBtn}>{current ? "Change" : "Save username"}</button>
      </form>
      <p className="text-xs text-ink-faint">3–20 characters: lowercase letters, numbers, dots and underscores.</p>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}
    </section>
  );
}
