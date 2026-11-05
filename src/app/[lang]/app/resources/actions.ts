"use server";

import { track } from "@/lib/events";
import { refresh } from "next/cache";
import { z } from "zod";
import { LlmError } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/tutor/server";
import { ResourceError, checkAnswers, generatePracticeSet, generateWritingTips } from "@/lib/tutor/resources/generate";
import { cleanFocus, needsAnswerCheck, type SetRequest } from "@/lib/tutor/resources/prompt";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  practiceSetSchema,
  unresolvedFlags,
  writingTipsSchema,
  type PracticeSet,
  type Question,
} from "@/lib/tutor/resources/schema";
import { RESOURCE_COLUMNS, resourceAccessFor, resourceLlm, type CurriculumPoint, type ResourceRow } from "@/lib/tutor/resources/server";
import { back, requireTutorAction } from "../_lib/action-helpers";

/**
 * Tutor resources (docs/tutor-resources-spec.md). Writes go through RLS as the signed-in tutor;
 * usage is logged with the service role (purpose "resource", its own monthly cap).
 */

const POINT_COLUMNS = "id, framework, subject, unit_or_level, area, code, summary";

async function loadResource(id: string): Promise<ResourceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tutor_resources").select(RESOURCE_COLUMNS).eq("id", id).maybeSingle<ResourceRow>();
  return data;
}

function failure(error: unknown): string {
  if (error instanceof ResourceError) return "shape";
  if (error instanceof LlmError) return "service";
  console.error("Resource generation failed", error instanceof Error ? error.message : error);
  return "service";
}

export async function createResource(formData: FormData) {
  const { tutor } = await requireTutorAction();
  const kind = formData.get("kind") === "writing_tips" ? "writing_tips" : "practice_set";
  const pointIds = z.array(z.uuid()).min(1).max(kind === "writing_tips" ? 1 : 12).safeParse(formData.getAll("point"));
  if (!pointIds.success) await back("/app/resources/new", `?${new URLSearchParams({ kind, error: "points", ...groupParams(formData) })}`);

  const access = await resourceAccessFor(tutor);
  if (!access.ok) await back("/app/resources", `?error=${access.reason}`);

  const supabase = await createClient();
  const { data: points } = await supabase.from("curriculum_points").select(POINT_COLUMNS).in("id", pointIds.data!).order("sort").returns<CurriculumPoint[]>();
  if (!points?.length || new Set(points.map((p) => `${p.framework}|${p.subject}|${p.unit_or_level}`)).size !== 1) {
    await back("/app/resources/new", `?${new URLSearchParams({ kind, error: "points", ...groupParams(formData) })}`);
  }
  const first = points![0];
  const focus = cleanFocus(String(formData.get("focus") ?? ""));
  let insert: Record<string, unknown>;
  let tokens = 0;

  try {
    if (kind === "writing_tips") {
      const tips = await generateWritingTips(resourceLlm(), { outcome: first.area, summary: first.summary, focus });
      tokens = tips.tokens;
      insert = { title: `Writing tips: ${first.area}`, settings: { focus }, content: tips.content, draft_json: tips.raw };
    } else {
      const settings = z
        .object({
          count: z.coerce.number().int().min(5).max(15),
          difficulty: z.enum(DIFFICULTIES),
          types: z.array(z.enum(QUESTION_TYPES)).min(1),
        })
        .parse({ count: formData.get("count"), difficulty: formData.get("difficulty"), types: formData.getAll("type") });
      const request: SetRequest = {
        framework: first.framework,
        subject: first.subject,
        unitOrLevel: first.unit_or_level,
        points: points!.map((p) => ({ area: p.area, code: p.code, summary: p.summary })),
        focus,
        ...settings,
      };
      const set = await generatePracticeSet(resourceLlm(), request);
      tokens = set.tokens;
      const areas = [...new Set(points!.map((p) => p.area))];
      insert = {
        title: `${first.subject} ${first.unit_or_level}: ${areas.slice(0, 2).join(", ")}${areas.length > 2 ? " and more" : ""}`.slice(0, 120),
        settings: { ...settings, focus },
        content: set.content,
        draft_json: set.raw,
      };
    }
  } catch (error) {
    await back("/app/resources/new", `?${new URLSearchParams({ kind, error: failure(error), ...groupParams(formData) })}`);
  }

  const { data: row, error } = await supabase
    .from("tutor_resources")
    .insert({
      tutor_id: tutor.id,
      kind,
      framework: first.framework,
      subject: first.subject,
      unit_or_level: first.unit_or_level,
      point_ids: points!.map((p) => p.id),
      ...insert!,
    })
    .select("id")
    .single();
  if (error) throw error;
  await logUsage(tutor.id, "llm_tokens", tokens, "resource");
  await track({ name: "resource_generated", product: "tutors", role: "tutor", userId: tutor.id, objectType: "tutor_resource", objectId: row.id, props: { kind, framework: first.framework }, dedupeKey: `resource:${row.id}` });
  await back(`/app/resources/${row.id}`);
}

function groupParams(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["group", "student"]) {
    const v = formData.get(key);
    if (typeof v === "string" && v) out[key] = v;
  }
  return out;
}

// --- Editing a practice set --------------------------------------------------------------------

async function updateSet(id: string, change: (set: PracticeSet) => PracticeSet) {
  await requireTutorAction();
  const row = await loadResource(id);
  if (!row || row.kind !== "practice_set") throw new Error("Not found.");
  const next = practiceSetSchema.parse(change(row.content as PracticeSet));
  const supabase = await createClient();
  // Any change sends an approved set back to draft: the tutor approves what they hand out.
  const { error } = await supabase.from("tutor_resources").update({ content: next, status: "draft", approved_at: null }).eq("id", id);
  if (error) throw error;
  refresh();
}

const ref = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0).max(14) });

export async function saveQuestion(formData: FormData) {
  const p = ref
    .extend({
      prompt: z.string().trim().min(1).max(1500),
      options: z.string().max(1600),
      answer: z.string().trim().min(1).max(600),
      solution: z.string().trim().min(1).max(3000),
      marks: z.coerce.number().int().min(1).max(10),
    })
    .parse(Object.fromEntries(formData));
  await updateSet(p.id, (set) => ({
    ...set,
    questions: set.questions.map((q, i): Question =>
      i !== p.index
        ? q
        : {
            ...q,
            prompt: p.prompt,
            answer: p.answer,
            solution: p.solution,
            marks: p.marks,
            options: q.type === "mcq" ? p.options.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 5) : [],
            flag: null, // the tutor has looked at it and edited it
            corrected: false,
          },
    ),
  }));
}

export async function dismissFlag(formData: FormData) {
  const p = ref.parse(Object.fromEntries(formData));
  await updateSet(p.id, (set) => ({ ...set, questions: set.questions.map((q, i) => (i === p.index ? { ...q, flag: null } : q)) }));
}

export async function deleteQuestion(formData: FormData) {
  const p = ref.parse(Object.fromEntries(formData));
  await updateSet(p.id, (set) => ({ ...set, questions: set.questions.filter((_, i) => i !== p.index) }));
}

export async function moveQuestion(formData: FormData) {
  const p = ref.extend({ dir: z.enum(["up", "down"]) }).parse(Object.fromEntries(formData));
  await updateSet(p.id, (set) => {
    const qs = [...set.questions];
    const to = p.dir === "up" ? p.index - 1 : p.index + 1;
    if (to < 0 || to >= qs.length) return set;
    [qs[p.index], qs[to]] = [qs[to], qs[p.index]];
    return { ...set, questions: qs };
  });
}

/** A new version of one question, same settings. Logged as usage; doesn't count as a new resource. */
export async function regenerateQuestion(formData: FormData) {
  const { tutor } = await requireTutorAction();
  const p = ref.parse(Object.fromEntries(formData));
  const row = await loadResource(p.id);
  if (!row || row.kind !== "practice_set") throw new Error("Not found.");
  const set = row.content as PracticeSet;
  const old = set.questions[p.index];
  if (!old) throw new Error("No such question.");
  const supabase = await createClient();
  const { data: points } = await supabase.from("curriculum_points").select(POINT_COLUMNS).in("id", row.point_ids).order("sort").returns<CurriculumPoint[]>();
  const request: SetRequest = {
    framework: row.framework,
    subject: row.subject,
    unitOrLevel: row.unit_or_level,
    points: (points ?? []).map((pt) => ({ area: pt.area, code: pt.code, summary: pt.summary })),
    count: 1,
    difficulty: (row.settings.difficulty as SetRequest["difficulty"]) ?? "standard",
    types: [old.type],
    focus: [...(row.settings.focus ?? []), `a different question from: ${old.prompt.slice(0, 50)}`].slice(0, 6),
  };
  let fresh: Question;
  try {
    const one = await generatePracticeSet(resourceLlm(), request);
    fresh = one.content.questions[0];
    await logUsage(tutor.id, "llm_tokens", one.tokens, "resource_edit");
  } catch (error) {
    await back(`/app/resources/${p.id}`, `?error=${failure(error)}`);
  }
  await updateSet(p.id, (s) => ({ ...s, questions: s.questions.map((q, i) => (i === p.index ? fresh! : q)) }));
}

/** Re-runs the answer check on the whole set (e.g. after edits). */
export async function recheckAnswers(formData: FormData) {
  const { tutor } = await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const row = await loadResource(id);
  if (!row || row.kind !== "practice_set" || !needsAnswerCheck(row.subject)) throw new Error("Not available.");
  let checked: PracticeSet;
  try {
    const result = await checkAnswers(resourceLlm(), { framework: row.framework, subject: row.subject, unitOrLevel: row.unit_or_level }, row.content as PracticeSet);
    checked = result.set;
    await logUsage(tutor.id, "llm_tokens", result.tokens, "resource_edit");
  } catch (error) {
    await back(`/app/resources/${id}`, `?error=${failure(error)}`);
  }
  await updateSet(id, () => checked!);
}

// --- Writing tips, approval, deletion ---------------------------------------------------------

export async function saveTips(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const count = z.coerce.number().int().min(1).max(8).parse(formData.get("sections"));
  const content = writingTipsSchema.parse({
    intro: String(formData.get("intro") ?? "").trim(),
    sections: Array.from({ length: count }, (_, i) => ({
      heading: String(formData.get(`heading-${i}`) ?? "").trim(),
      tips: lines(formData.get(`tips-${i}`)),
      example: String(formData.get(`example-${i}`) ?? "").trim(),
    })).filter((s) => s.heading && s.tips.length),
    mistakes: lines(formData.get("mistakes")),
  });
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_resources").update({ content, status: "draft", approved_at: null }).eq("id", id);
  if (error) throw error;
  await back(`/app/resources/${id}`, "?saved=1");
}

export async function approveResource(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const row = await loadResource(id);
  if (!row) throw new Error("Not found.");
  if (row.kind === "practice_set" && unresolvedFlags(row.content as PracticeSet) > 0) await back(`/app/resources/${id}`, "?error=flags");
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_resources").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  refresh();
}

export async function renameResource(formData: FormData) {
  await requireTutorAction();
  const p = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(120) }).parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_resources").update({ title: p.title }).eq("id", p.id);
  if (error) throw error;
  refresh();
}

export async function deleteResource(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_resources").delete().eq("id", id);
  if (error) throw error;
  await back("/app/resources", "?deleted=1");
}
