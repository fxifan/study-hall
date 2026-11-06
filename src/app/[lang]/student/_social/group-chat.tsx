"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { browserClient } from "@/lib/supabase/client";
import { blockUser, reportMessage, sendMessage } from "./actions";

export type ChatMessage = { id: string; sender_id: string | null; kind: string; body: string; created_at: string };

/**
 * Group chat. History comes from the server; new messages arrive over Supabase Realtime, which
 * only delivers rows the member can read under RLS (members only, hidden messages excluded).
 * Messages from people this student blocked are left out here too.
 */
export function GroupChat({
  groupId,
  meId,
  initial,
  names,
  blocked,
  canPost,
}: {
  groupId: string;
  meId: string;
  initial: ChatMessage[];
  names: Record<string, string>;
  blocked: string[];
  canPost: boolean;
}) {
  const router = useRouter();
  // Server history plus anything Realtime delivered since the last refresh.
  const [arrived, setArrived] = useState<ChatMessage[]>([]);
  const known = new Set(initial.map((m) => m.id));
  const messages = [...initial, ...arrived.filter((m) => !known.has(m.id))];
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const hidden = new Set(blocked);

  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      .channel(`group:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, (payload: { new: unknown }) => {
        const m = payload.new as ChatMessage;
        setArrived((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(-100), m]));
        // System events (someone started studying, help, recap) change the board and goal.
        if (m.kind !== "text") router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await sendMessage(groupId, body);
      if (r.ok) {
        setText("");
        setError(null);
        router.refresh();
      } else setError(r.error);
    });
  };

  return (
    <section aria-label="Group chat" className="flex min-h-[24rem] flex-col rounded-lg border border-rule bg-sheet">
      <ol ref={list} className="flex max-h-[28rem] flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages
          .filter((m) => !m.sender_id || !hidden.has(m.sender_id) || m.kind !== "text")
          .map((m) => {
            const mine = m.sender_id === meId;
            const time = new Date(m.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
            if (m.kind !== "text") {
              return (
                <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.kind === "help" ? "border border-warning bg-paper" : m.kind === "recap" ? "bg-brand-soft" : "text-ink-soft"}`}>
                  {m.kind === "help" && <span className="mr-1 font-medium">Call out:</span>}
                  {m.kind === "recap" && <span className="mr-1 font-medium">Daily recap:</span>}
                  {m.body} <span className="text-xs text-ink-faint">{time}</span>
                </li>
              );
            }
            return (
              <li key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <span className="text-xs text-ink-faint">
                  {mine ? "You" : (m.sender_id && names[m.sender_id]) || "Former member"} · {time}
                </span>
                <div className="flex items-center gap-1">
                  {!mine && m.sender_id && (
                    <div className="relative order-2">
                      <button
                        type="button"
                        aria-label="Message options"
                        onClick={() => setMenu(menu === m.id ? null : m.id)}
                        className="rounded px-1 text-ink-faint opacity-60 hover:opacity-100"
                      >
                        ⋯
                      </button>
                      {menu === m.id && (
                        <div className="absolute left-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-rule bg-sheet text-sm shadow">
                          <button
                            type="button"
                            className="px-3 py-2 text-left hover:bg-paper-deep"
                            onClick={() =>
                              startTransition(async () => {
                                const reason = window.prompt("What's wrong with this message? A moderator will check it.") ?? "";
                                const r = await reportMessage(m.id, reason);
                                setMenu(null);
                                setError(r.ok ? null : r.error);
                                if (r.ok) window.alert("Thanks. A moderator will look at it.");
                              })
                            }
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 text-left hover:bg-paper-deep"
                            onClick={() =>
                              startTransition(async () => {
                                if (!window.confirm("Block this person? You won't see their messages.")) return;
                                await blockUser(m.sender_id!);
                                setMenu(null);
                              })
                            }
                          >
                            Block
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <p className={`max-w-[34ch] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[48ch] ${mine ? "bg-ink text-paper" : "bg-paper-deep"}`}>{m.body}</p>
                </div>
              </li>
            );
          })}
      </ol>
      {canPost ? (
        <form onSubmit={send} className="flex gap-2 border-t border-rule p-2">
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <input
            id="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Message the group"
            className="h-10 flex-1 rounded-md border border-rule bg-paper px-3"
          />
          <button disabled={pending || !text.trim()} className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
            Send
          </button>
        </form>
      ) : (
        <p className="border-t border-rule p-3 text-sm text-ink-soft">Your chat is paused by a moderator for now.</p>
      )}
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm text-pen">
          {error}
        </p>
      )}
    </section>
  );
}
