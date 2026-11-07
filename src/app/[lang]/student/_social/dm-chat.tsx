"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { browserClient } from "@/lib/supabase/client";
import { reportDm, respondGroupInvite, sendDm } from "./friend-actions";

export type Dm = { id: string; a: string; b: string; sender_id: string | null; kind: string; body: string; invite_id: string | null; created_at: string };
export type InviteView = { id: string; groupName: string; members: number; state: string; mine: boolean };

/**
 * A one-to-one conversation between friends (docs/friends.md). History comes from the server; new
 * messages arrive over Realtime, which only delivers the viewer's own conversations under RLS.
 * Group invites show as cards: the invitee can join or decline, the inviter sees where it stands.
 */
export function DmChat({
  meId,
  friendId,
  friendName,
  initial,
  invites,
  canPost,
}: {
  meId: string;
  friendId: string;
  friendName: string;
  initial: Dm[];
  invites: Record<string, InviteView>;
  canPost: boolean;
}) {
  const router = useRouter();
  const [arrived, setArrived] = useState<Dm[]>([]);
  const known = new Set(initial.map((m) => m.id));
  const messages = [...initial, ...arrived.filter((m) => !known.has(m.id))];
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const [a, b] = meId < friendId ? [meId, friendId] : [friendId, meId];

  useEffect(() => {
    const supabase = browserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }: { data: { session: { access_token: string } | null } }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`dm:${a}:${b}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `a=eq.${a}` }, (payload: { new: unknown }) => {
          const m = payload.new as Dm;
          if (m.b !== b) return;
          setArrived((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(-100), m]));
          // Invite cards need their group details from the server; incoming messages mark the thread read.
          if (m.kind === "invite" || m.sender_id !== meId) router.refresh();
        })
        .subscribe((status: string) => {
          // A dropped or failed join: catch up from the server; the client library rejoins on its own.
          if (!cancelled && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) router.refresh();
        });
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [a, b, meId, router]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await sendDm(friendId, body);
      if (r.ok) {
        setText("");
        setError(null);
        router.refresh();
      } else setError(r.error);
    });
  };

  const report = (id: string) => {
    const reason = window.prompt("What's wrong with this message? A moderator will look at it.") ?? "";
    setMenu(null);
    startTransition(async () => {
      const r = await reportDm(id, reason);
      setNotice(r.ok ? "Thanks. A moderator will look at it." : r.error);
    });
  };

  return (
    <section aria-label={`Messages with ${friendName}`} className="flex min-h-[26rem] flex-col rounded-2xl border border-rule bg-sheet lg:h-[min(44rem,calc(100dvh-14rem))]">
      <ol ref={list} className="flex max-h-[32rem] min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 lg:max-h-none">
        {messages.length === 0 && <li className="m-auto max-w-[28ch] text-center text-sm text-ink-faint">Say hi to {friendName}. Only the two of you see this chat.</li>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const time = new Date(m.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
          if (m.kind === "invite" && m.invite_id) {
            const inv = invites[m.invite_id];
            if (!inv) return null;
            return (
              <li key={m.id} className="self-stretch rounded-2xl bg-[var(--tiles-sand)] p-3" data-testid="invite-card">
                <p className="text-sm font-semibold text-[var(--tiles-sand-ink,#5f513a)]">{inv.mine ? `You invited ${friendName} to ${inv.groupName}` : `${friendName} invited you to ${inv.groupName}`}</p>
                <p className="mb-2 text-xs text-ink-soft">
                  {inv.members} member{inv.members === 1 ? "" : "s"} · {time}
                </p>
                {inv.state === "pending" && !inv.mine ? (
                  <div className="flex gap-2">
                    <form action={respondGroupInvite.bind(null, inv.id, true)}>
                      <button className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-sm font-medium text-paper">Join {inv.groupName}</button>
                    </form>
                    <form action={respondGroupInvite.bind(null, inv.id, false)}>
                      <button className="inline-flex h-8 items-center rounded-full border border-rule bg-sheet px-3.5 text-sm">No thanks</button>
                    </form>
                  </div>
                ) : (
                  <span className="rounded-full bg-sheet/70 px-2.5 py-1 text-xs text-ink-soft">
                    {inv.state === "pending" ? `Waiting for ${friendName}` : inv.state === "accepted" ? (inv.mine ? `${friendName} joined` : "You joined") : inv.state === "declined" ? "Declined" : "No longer open"}
                  </span>
                )}
              </li>
            );
          }
          return (
            <li key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-1">
                {!mine && (
                  <div className="relative order-2">
                    <button
                      type="button"
                      aria-label="Message options"
                      aria-expanded={menu === m.id}
                      onClick={() => setMenu(menu === m.id ? null : m.id)}
                      className="rounded px-1 text-ink-faint opacity-60 hover:opacity-100"
                    >
                      ⋯
                    </button>
                    {menu === m.id && (
                      <div className="absolute left-0 z-10 mt-1 w-32 overflow-hidden rounded-xl border border-rule bg-sheet text-sm shadow">
                        <button type="button" onClick={() => report(m.id)} className="block w-full px-3 py-2 text-left hover:bg-paper-deep">
                          Report
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <p className={`max-w-[34ch] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[48ch] ${mine ? "bg-ink text-paper" : "bg-paper-deep"}`}>{m.body}</p>
              </div>
              <span className="mt-0.5 text-[11px] text-ink-faint">{time}</span>
            </li>
          );
        })}
      </ol>
      {notice && (
        <p role="status" className="px-3 pb-1 text-sm text-ink-soft">
          {notice}
        </p>
      )}
      {canPost ? (
        <form onSubmit={send} className="flex gap-2 border-t border-rule p-2">
          <label htmlFor="dm-input" className="sr-only">
            Message {friendName}
          </label>
          <input
            id="dm-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder={`Message ${friendName}`}
            className="h-10 min-w-0 flex-1 rounded-md border border-rule bg-paper px-3"
          />
          <button disabled={pending || !text.trim()} className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
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
