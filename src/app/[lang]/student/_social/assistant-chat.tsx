"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MathKeyboard, MathPreview, MathToggle } from "@/components/math-keyboard";
import { MathLine, MathText } from "@/components/math-text";
import { autoMath } from "@/lib/math-input";
import { ASSISTANT_DAILY_LIMIT, MAX_STUDENT_MESSAGE, QUICK_REPLIES, type AssistantReply, type QuickReply, type ReplyBlock } from "@/lib/social/assistant";
import type { ChatMessage } from "@/lib/social/assistant-server";
import { flagMessage, rateMessage, saveConversation, sendChatMessage } from "./assistant-actions";

/**
 * The EduMi AI chat. Replies render as blocks: an explanation, numbered working, "your turn",
 * hints, a likely mistake (always worded as a suggestion) or a correct answer. Under the latest
 * reply: quick replies (hint, another way, test me, full solution), thumbs and a flag.
 */
type Props = {
  conversationId: string;
  initial: ChatMessage[];
  saved: boolean;
  left: number;
  initialError: string | null;
  /** False without the add-on: the chat is read-only. */
  canSend: boolean;
};

const BLOCK_STYLE: Record<ReplyBlock["type"], { box: string; label: string; tone: string }> = {
  text: { box: "", label: "", tone: "" },
  explain: { box: "bg-paper-deep", label: "", tone: "text-ink-soft" },
  steps: { box: "bg-paper-deep", label: "Working", tone: "text-ink-soft" },
  try: { box: "bg-[var(--tiles-sage-soft)]", label: "Your turn", tone: "text-[var(--tiles-sage-ink)]" },
  hint: { box: "bg-[var(--tiles-sage-soft)]", label: "Hint", tone: "text-[var(--tiles-sage-ink)]" },
  mistake: { box: "bg-[var(--tiles-sand)]", label: "Let's look at that", tone: "text-[var(--tiles-sand-ink)]" },
  correct: { box: "border border-[var(--tiles-sage)] bg-[var(--tiles-sage-soft)]", label: "Correct", tone: "text-[var(--tiles-sage-ink)]" },
};

function Block({ b }: { b: ReplyBlock }) {
  const st = BLOCK_STYLE[b.type];
  const label = b.title || st.label;
  if (b.type === "text" && !b.steps.length)
    return (
      <p className="leading-relaxed whitespace-pre-wrap">
        <MathText text={b.body} />
      </p>
    );
  return (
    <div className={`flex flex-col gap-2 rounded-xl px-3.5 py-3 ${st.box}`}>
      {label && <p className={`font-mono text-[11px] font-semibold tracking-wide uppercase ${st.tone}`}>{label}</p>}
      {b.body && (
        <p className="leading-relaxed whitespace-pre-wrap">
          <MathText text={b.body} />
        </p>
      )}
      {b.steps.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {b.steps.map((s, i) => (
            // Each step: what to do, then its line of working underneath, so long maths has room.
            <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-x-2 gap-y-1">
              <span className="font-mono text-xs leading-6 text-ink-faint">{i + 1}</span>
              <span className="text-sm leading-6">
                <MathText text={s.text} />
              </span>
              {s.math && (
                <span className="col-start-2 w-fit max-w-full rounded-lg bg-sheet/70 px-2.5 py-1">
                  <MathLine tex={s.math} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const pill = "inline-flex h-8 items-center justify-center rounded-full border border-rule bg-sheet px-3 text-xs font-medium text-ink hover:bg-paper-deep disabled:opacity-50";

export function AssistantChat({ conversationId, initial, saved: savedInitially, left: leftInitially, initialError, canSend }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [left, setLeft] = useState(leftInitially);
  const [saved, setSaved] = useState(savedInitially);
  const [ratings, setRatings] = useState<Record<string, -1 | 1 | null>>(() => Object.fromEntries(initial.map((m) => [m.id, m.feedback])));
  const [flagging, setFlagging] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set(initial.filter((m) => m.flagged_at).map((m) => m.id)));
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const send = (text: string) => {
    const body = text.trim();
    if (!body || pending || !canSend) return;
    setError(null);
    setDraft("");
    const temp: ChatMessage = { id: `local-${Date.now()}`, role: "student", body, content: null, feedback: null, flagged_at: null, created_at: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    start(async () => {
      const r = await sendChatMessage(conversationId, body);
      setLeft(r.left);
      if (r.ok) setMessages((m) => [...m, r.reply]);
      else setError(r.error);
    });
  };

  const rate = (id: string, value: -1 | 1) => {
    const next = ratings[id] === value ? null : value;
    setRatings((r) => ({ ...r, [id]: next }));
    void rateMessage(id, next);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const awaiting = (lastAssistant?.content as AssistantReply | null)?.awaiting_answer ?? false;
  const quick: QuickReply[] = awaiting ? ["hint", "full"] : ["another", "test"];

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col overflow-hidden rounded-2xl border border-rule bg-sheet" aria-label="Chat">
        <div className="flex flex-col gap-4 p-4 sm:p-5" aria-live="polite">
          {messages.map((m) =>
            m.role === "student" ? (
              <p key={m.id} className="max-w-[88%] self-end rounded-2xl rounded-br-sm bg-ink px-3.5 py-2.5 break-words whitespace-pre-wrap text-paper">
                <MathText text={autoMath(m.body)} />
              </p>
            ) : (
              <div key={m.id} className="flex max-w-full flex-col gap-2 self-start sm:max-w-[88%]">
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--tiles-sage-ink)]">
                  <span aria-hidden className="grid size-[22px] place-items-center rounded-md bg-[var(--tiles-sage-strong)] font-[family-name:var(--font-manrope)] text-xs font-extrabold text-paper">
                    e
                  </span>
                  EduMi AI
                </p>
                {m.content ? (m.content as AssistantReply).blocks.map((b, i) => <Block key={i} b={b} />) : <p className="whitespace-pre-wrap">{m.body}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  {canSend &&
                    m.id === lastAssistant?.id &&
                    quick.map((q) => (
                      <button key={q} type="button" className={pill} disabled={pending || left <= 0} onClick={() => send(QUICK_REPLIES[q])}>
                        {q === "hint" ? "Give me a hint" : q === "full" ? "Show the full solution" : q === "another" ? "Explain it another way" : "Test me"}
                      </button>
                    ))}
                  <span className="ml-0.5 flex items-center">
                    <IconButton label="Helpful" on={ratings[m.id] === 1} onClick={() => rate(m.id, 1)} path="M7 10v11H3V10zM7 10l4-7c1.7 0 3 1.3 3 3v3h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18 21H7" />
                    <IconButton label="Not helpful" on={ratings[m.id] === -1} onClick={() => rate(m.id, -1)} path="M17 14V3h4v11zM17 14l-4 7c-1.7 0-3-1.3-3-3v-3H4.5a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 6 3h11" />
                    <IconButton label={flagged.has(m.id) ? "Flagged" : "Flag this answer"} on={flagged.has(m.id)} onClick={() => setFlagging(m.id)} path="M5 21V4h12l-2 4 2 4H5" />
                  </span>
                </div>
              </div>
            ),
          )}
          {pending && (
            <p className="flex gap-1 self-start py-2" role="status" aria-label="EduMi AI is writing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </p>
          )}
          <div ref={end} />
        </div>
        {canSend && (
          <div className="flex flex-col gap-2 border-t border-rule p-3">
            <MathPreview text={draft} />
            {keyboard && <MathKeyboard target={input} value={draft} onChange={setDraft} />}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <MathToggle open={keyboard} onToggle={() => setKeyboard(!keyboard)} className="h-11" />
              <label htmlFor="chat-message" className="sr-only">
                Message
              </label>
              <input
                ref={input}
                id="chat-message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_STUDENT_MESSAGE}
                autoComplete="off"
                autoCapitalize="off"
                placeholder={awaiting ? "Type your answer, or what you'd do first" : "Ask a follow-up question"}
                className="h-11 min-w-0 flex-1 rounded-full border border-rule bg-paper px-4 text-sm"
              />
              <button className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50" disabled={pending || !draft.trim() || left <= 0}>
                Send
              </button>
            </form>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {canSend && `${left} of ${ASSISTANT_DAILY_LIMIT} questions left today. `}Your chats are private: parents, tutors and supervisors can&apos;t see them. AI can make mistakes: flag anything that looks wrong.
        </p>
        <button
          type="button"
          className={pill}
          onClick={() => {
            setSaved(!saved);
            void saveConversation(conversationId, !saved);
          }}
        >
          {saved ? "Saved to Your practice ✓" : "Save to Your practice"}
        </button>
      </div>
      {flagging && (
        <FlagDialog
          onClose={() => setFlagging(null)}
          onSend={(reason, note) => {
            const id = flagging;
            setFlagging(null);
            setFlagged((s) => new Set(s).add(id));
            void flagMessage(id, reason, note);
          }}
        />
      )}
    </div>
  );
}

function IconButton({ label, on, onClick, path }: { label: string; on: boolean; onClick: () => void; path: string }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={`grid size-8 place-items-center rounded-full hover:bg-paper-deep ${on ? "bg-paper-deep text-ink" : "text-ink-faint"}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}

function FlagDialog({ onClose, onSend }: { onClose: () => void; onSend: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState("wrong");
  const [note, setNote] = useState("");
  const options = [
    ["wrong", "It's wrong"],
    ["unclear", "Hard to understand"],
    ["level", "Not right for my year level"],
    ["inappropriate", "Something inappropriate"],
  ] as const;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 p-4" role="dialog" aria-modal="true" aria-labelledby="flag-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-rule bg-sheet p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(reason, note);
        }}
      >
        <h2 id="flag-title" className="text-lg font-semibold">
          Flag this answer
        </h2>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="sr-only">What&apos;s wrong?</legend>
          {options.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} />
              {l}
            </label>
          ))}
        </fieldset>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={250} rows={3} placeholder="Anything else? (optional)" className="rounded-md border border-rule bg-paper px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-full border border-rule bg-sheet px-4 text-sm font-medium">
            Cancel
          </button>
          <button className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper">Send</button>
        </div>
      </form>
    </div>
  );
}
