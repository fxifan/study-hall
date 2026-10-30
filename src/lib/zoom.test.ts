import { describe, expect, it, vi } from "vitest";
import { ZoomError, createZoomMeeting, zoomConfigured } from "./zoom";

const env = { ZOOM_ACCOUNT_ID: "acct", ZOOM_CLIENT_ID: "id", ZOOM_CLIENT_SECRET: "secret", ZOOM_HOST_EMAIL: "host@example.com" };

describe("Zoom meetings", () => {
  it("needs all four settings", () => {
    expect(zoomConfigured(env)).toBe(true);
    expect(zoomConfigured({ ...env, ZOOM_HOST_EMAIL: "" })).toBe(false);
  });

  it("creates a recurring meeting with recording, AI summaries and chat off, and a waiting room", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "tok" }))
      .mockResolvedValueOnce(Response.json({ id: 123, join_url: "https://zoom.us/j/123" }, { status: 201 }));
    const meeting = await createZoomMeeting("Room 1", { env, fetchImpl });
    expect(meeting).toEqual({ id: "123", joinUrl: "https://zoom.us/j/123" });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe("https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acct");
    expect(tokenInit.headers.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);

    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.zoom.us/v2/users/host%40example.com/meetings");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ topic: "Study Hall: Room 1", type: 3 });
    expect(body.settings).toMatchObject({
      auto_recording: "none",
      waiting_room: true,
      join_before_host: false,
      auto_start_meeting_summary: false,
      auto_start_ai_companion_questions: false,
      continuous_meeting_chat: { enable: false },
    });
  });

  it("reports Zoom's error message", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "tok" }))
      .mockResolvedValueOnce(Response.json({ code: 1001, message: "User does not exist" }, { status: 404 }));
    await expect(createZoomMeeting("Room 1", { env, fetchImpl })).rejects.toThrow(new ZoomError("User does not exist"));
  });
});
