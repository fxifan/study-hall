import { liveSessionFor, sessionSeconds, type SocialStudent } from "@/lib/social/server";
import { StudyTimer } from "./study-timer";

/** The running timer as a slim bar on other student pages. */
export async function ShellTimer({ me }: { me: SocialStudent }) {
  const live = await liveSessionFor(me.profile.id);
  if (!live) return null;
  return <StudyTimer compact initial={{ sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: live.group_id, startedAt: live.started_at }} />;
}
