import type { Metadata } from "next";
import { Suspense } from "react";
import { dayWindow, groupDayOf, rank, shortMinutes, weekWindow } from "@/lib/social/credit";
import { namesFor, personSeconds, requireSocialStudent } from "@/lib/social/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MELBOURNE } from "@/lib/time";
import { respondFriend, setFriendsBoard } from "../_social/actions";
import { Loading, StudentShell, card, tile, smallBtn } from "../_social/shell";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage({ searchParams }: PageProps<"/[lang]/student/friends">) {
  return (
    <Suspense fallback={<Loading />}>
      <Friends searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Friends board: accepted friends who opted in, daily or weekly eligible minutes across all their
 * sessions (each counted once), in Melbourne time. It never shows which groups a friend is in.
 */
async function Friends({ searchParams }: Pick<PageProps<"/[lang]/student/friends">, "searchParams">) {
  const [me, query] = await Promise.all([requireSocialStudent(), searchParams]);
  const admin = createAdminClient();
  const week = query.view === "week";
  const { data: rows } = await admin.from("friendships").select("a, b, status, requested_by").or(`a.eq.${me.profile.id},b.eq.${me.profile.id}`);
  const other = (r: { a: string; b: string }) => (r.a === me.profile.id ? r.b : r.a);
  const accepted = (rows ?? []).filter((r) => r.status === "accepted").map(other);
  const incoming = (rows ?? []).filter((r) => r.status === "pending" && r.requested_by !== me.profile.id).map(other);
  const outgoing = (rows ?? []).filter((r) => r.status === "pending" && r.requested_by === me.profile.id).map(other);
  const { data: settings } = await admin.from("student_settings").select("profile_id, friends_board_opt_in").in("profile_id", [me.profile.id, ...accepted]);
  const optIn = new Map((settings ?? []).map((s) => [s.profile_id as string, s.friends_board_opt_in as boolean]));
  const iOptIn = optIn.get(me.profile.id) ?? true;
  const onBoard = [me.profile.id, ...accepted].filter((id) => optIn.get(id) ?? true);
  const names = await namesFor([...accepted, ...incoming, ...outgoing]);

  const day = groupDayOf(new Date(), MELBOURNE);
  const w = week ? weekWindow(day, MELBOURNE) : dayWindow(day, MELBOURNE);
  const totals = iOptIn ? await personSeconds(onBoard, w.start, w.end) : new Map<string, number>();
  const standings = rank(new Map(onBoard.map((id) => [id, totals.get(id) ?? 0])));

  return (
    <StudentShell me={me} title="Friends" current="friends">
      <section className={`${tile} flex flex-col gap-3 bg-brand-soft`}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{week ? "This week" : "Today"}</h2>
          <a href={week ? "?" : "?view=week"} className="text-xs">
            {week ? "Show today" : "Show week"}
          </a>
        </div>
        {!iOptIn ? (
          <p className="text-sm text-ink-soft">You&apos;ve hidden yourself from the Friends board, so it&apos;s hidden for you too.</p>
        ) : accepted.length === 0 ? (
          <p className="text-sm text-ink-soft">Add friends from your group member lists. Only accepted friends see each other here.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {standings.map((s) => (
              <li key={s.profileId} className="flex justify-between">
                <span>
                  <span className="inline-block w-6 font-mono text-ink-faint">{s.rank}</span>
                  {s.profileId === me.profile.id ? "You" : names.get(s.profileId)}
                </span>
                <span className="font-mono">{shortMinutes(Math.floor(s.seconds / 60))}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-ink-faint">Verified study minutes across all groups, Melbourne time{week ? ", Monday to Sunday" : ""}.</p>
        <form action={setFriendsBoard} className="flex items-center gap-2 text-sm">
          <label className="flex gap-2">
            <input type="checkbox" name="friends_board_opt_in" defaultChecked={iOptIn} /> Show me on the Friends board
          </label>
          <button className={smallBtn}>Save</button>
        </form>
      </section>

      {incoming.length > 0 && (
        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-medium">Friend requests</h2>
          {incoming.map((id) => (
            <div key={id} className="flex items-center justify-between gap-2 text-sm">
              <span>{names.get(id)}</span>
              <span className="flex gap-2">
                <form action={respondFriend.bind(null, id, true)}>
                  <button className={smallBtn}>Accept</button>
                </form>
                <form action={respondFriend.bind(null, id, false)}>
                  <button className={smallBtn}>Decline</button>
                </form>
              </span>
            </div>
          ))}
        </section>
      )}

      {(accepted.length > 0 || outgoing.length > 0) && (
        <section className={`${card} flex flex-col gap-2 text-sm`}>
          <h2 className="font-medium">Your friends</h2>
          {accepted.map((id) => (
            <div key={id} className="flex items-center justify-between">
              <span>{names.get(id)}</span>
              <form action={respondFriend.bind(null, id, false)}>
                <button className="text-xs text-ink-soft">Remove</button>
              </form>
            </div>
          ))}
          {outgoing.map((id) => (
            <div key={id} className="flex items-center justify-between text-ink-soft">
              <span>{names.get(id)} (requested)</span>
              <form action={respondFriend.bind(null, id, false)}>
                <button className="text-xs">Cancel</button>
              </form>
            </div>
          ))}
        </section>
      )}
    </StudentShell>
  );
}
