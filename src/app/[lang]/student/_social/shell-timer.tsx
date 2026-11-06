import { liveSessionFor, sessionSeconds, type SocialStudent } from "@/lib/social/server";
import { StudyTimer } from "./study-timer";

/** The running timer as a slim bar on study screens other than the group page. */
export async function ShellTimer({ me, studyScreen = true }: { me: SocialStudent; studyScreen?: boolean }) {
  const live = await liveSessionFor(me.profile.id);
  if (!live) return null;
  return <StudyTimer compact studyScreen={studyScreen} initial={{ sessionId: live.id, state: live.state, seconds: await sessionSeconds(live), groupId: live.group_id }} />;
}
