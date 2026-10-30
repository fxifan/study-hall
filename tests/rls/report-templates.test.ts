/**
 * Report templates: admins manage them; supervisors read the active ones; families read none.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";
import { signInAs } from "../helpers";

const service = createAdminClient();
let admin: SupabaseClient;
let proctor: SupabaseClient;
let parent: SupabaseClient;
let inactiveId: string;

beforeAll(async () => {
  [admin, proctor, parent] = await Promise.all([signInAs("admin"), signInAs("proctor"), signInAs("parentA")]);
  const { data, error } = await service
    .from("report_templates")
    .insert({ org_id: SEED_IDS.org, kind: "comment", text_en: "RLS inactive template", text_zh: "停用模板", active: false })
    .select("id")
    .single();
  if (error) throw error;
  inactiveId = data.id;
});

afterAll(async () => {
  await service.from("report_templates").delete().eq("id", inactiveId);
});

describe("report templates", () => {
  it("lets supervisors read active templates only", async () => {
    const { data } = await proctor.from("report_templates").select("id, active");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((t) => t.active)).toBe(true);
    expect(data!.map((t) => t.id)).not.toContain(inactiveId);
  });

  it("doesn't let supervisors change them", async () => {
    const { error } = await proctor
      .from("report_templates")
      .insert({ org_id: SEED_IDS.org, kind: "comment", text_en: "x", text_zh: "x" });
    expect(error?.code).toBe("42501");
  });

  it("shows families nothing", async () => {
    const { data } = await parent.from("report_templates").select("id");
    expect(data).toEqual([]);
  });

  it("lets admins see and edit all of them", async () => {
    const { data } = await admin.from("report_templates").select("id").eq("id", inactiveId);
    expect(data).toEqual([{ id: inactiveId }]);
    const { error } = await admin.from("report_templates").update({ text_zh: "已修改" }).eq("id", inactiveId);
    expect(error).toBeNull();
  });
});
