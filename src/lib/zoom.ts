import "server-only";

/**
 * Creates Zoom meetings for rooms from /admin/rooms, through a Zoom Server-to-Server OAuth app
 * (env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_HOST_EMAIL, the licensed user
 * who hosts; server-to-server apps can't use "me"). Without them, admins paste a meeting link instead.
 */

/**
 * Settings for every Study Hall meeting (docs/in-site-video-plan.md, "Zoom account settings"). Lock
 * the same ones at account level too: a meeting setting can't stop a host recording by hand.
 */
export const ZOOM_MEETING_SETTINGS = {
  host_video: true,
  participant_video: true,
  join_before_host: false,
  waiting_room: true,
  mute_upon_entry: true,
  approval_type: 2, // no registration: students join from their Study Hall page
  meeting_authentication: false,
  auto_recording: "none",
  auto_start_meeting_summary: false,
  auto_start_ai_companion_questions: false,
  continuous_meeting_chat: { enable: false }, // help goes through the app, where it's logged
  private_meeting: true,
} as const;

export class ZoomError extends Error {}

type ZoomEnv = Record<string, string | undefined>;

export function zoomConfigured(env: ZoomEnv = process.env): boolean {
  return Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET && env.ZOOM_HOST_EMAIL);
}

/** A recurring meeting with no fixed time, so the room keeps one join link for every session. */
export function zoomMeetingBody(roomName: string) {
  return { topic: `Study Hall: ${roomName}`, type: 3, settings: ZOOM_MEETING_SETTINGS };
}

export async function createZoomMeeting(
  roomName: string,
  { env = process.env, fetchImpl = fetch }: { env?: ZoomEnv; fetchImpl?: typeof fetch } = {},
): Promise<{ id: string; joinUrl: string }> {
  if (!zoomConfigured(env)) throw new ZoomError("Zoom isn't connected.");
  const basic = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const token = await fetchImpl(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID!)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!token.ok) throw new ZoomError(`Zoom sign-in failed (${token.status}). Check the app's credentials.`);
  const { access_token } = (await token.json()) as { access_token: string };

  const res = await fetchImpl(`https://api.zoom.us/v2/users/${encodeURIComponent(env.ZOOM_HOST_EMAIL!)}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(zoomMeetingBody(roomName)),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: number | string; join_url?: string; message?: string };
  if (!res.ok || !body.id || !body.join_url) throw new ZoomError(body.message ?? `Zoom returned ${res.status}.`);
  return { id: String(body.id), joinUrl: body.join_url };
}
