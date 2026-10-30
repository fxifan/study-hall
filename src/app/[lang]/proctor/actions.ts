"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { breakoutErrorCode, type BreakoutError } from "@/lib/breakouts";
import { createClient } from "@/lib/supabase/server";

// Breakout log (docs/in-site-video-plan.md). The database functions check that the caller is the
// session's staff or an admin, that every adult has a valid WWCC, and the two-students-or-two-adults
// rule; these actions only parse the form and report the result.

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "proctor" && profile.role !== "admin")) throw new Error("Staff only.");
}

export type BreakoutState = { status: "idle" } | { status: "started" } | { status: "error"; code: BreakoutError };

export async function startBreakout(_prev: BreakoutState, formData: FormData): Promise<BreakoutState> {
  await requireStaff();
  const parsed = z
    .object({
      sessionId: z.uuid(),
      adultId: z.uuid(),
      secondAdultId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
      studentIds: z.array(z.uuid()).min(1),
    })
    .safeParse({
      sessionId: formData.get("sessionId"),
      adultId: formData.get("adultId"),
      secondAdultId: formData.get("secondAdultId") ?? "",
      studentIds: formData.getAll("studentId"),
    });
  if (!parsed.success) return { status: "error", code: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_breakout", {
    p_session: parsed.data.sessionId,
    p_adult: parsed.data.adultId,
    p_students: parsed.data.studentIds,
    p_second_adult: parsed.data.secondAdultId,
  });
  if (error) {
    const code = breakoutErrorCode(error.message);
    if (code === "failed") console.error("start_breakout failed", error.code, error.message);
    return { status: "error", code };
  }
  refresh();
  return { status: "started" };
}

export async function endBreakout(formData: FormData) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_breakout", { p_breakout: z.uuid().parse(formData.get("breakoutId")) });
  if (error) throw error;
  refresh();
}
