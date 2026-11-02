"use server";

import { z } from "zod";
import { encryptSecret } from "@/lib/tutor/crypto";
import { createClient } from "@/lib/supabase/server";
import { back, requireTutorAction } from "./_lib/action-helpers";

// Families, students and settings. Every write goes through RLS as the signed-in tutor.

/** "60" or "60.50" (dollars) -> 6000 cents; "" -> null. */
const dollars = z
  .string()
  .trim()
  .regex(/^(\d{1,4})(\.\d{1,2})?$|^$/)
  .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));
const text = (max: number) => z.string().trim().max(max);
const subjects = z
  .string()
  .max(400)
  .transform((v) =>
    [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 10).map((s) => s.slice(0, 40)),
  );
const familyFields = {
  parentName: text(100).min(1),
  parentEmail: z.email().trim().toLowerCase(),
  reportLang: z.enum(["en", "zh-CN", "both"]),
  rate: dollars,
};
const studentFields = {
  firstName: text(50).min(1),
  lastInitial: z
    .string()
    .trim()
    .transform((v) => v.slice(0, 1).toUpperCase())
    .pipe(z.string().length(1)),
  yearLevel: z.coerce.number().int().min(0).max(12),
  subjects,
  notes: text(500),
};

function form(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ""]));
}

// --- Families ----------------------------------------------------------------------------------

/** Add a student, with a new family or an existing one (the usual first step). */
export async function addStudent(formData: FormData) {
  const { profile } = await requireTutorAction();
  const parsed = z
    .object({ ...studentFields, familyId: z.union([z.uuid(), z.literal("new")]) })
    .safeParse(form(formData, ["firstName", "lastInitial", "yearLevel", "subjects", "notes", "familyId"]));
  if (!parsed.success) return back("/app/students", "?error=student");
  const supabase = await createClient();

  let familyId = parsed.data.familyId;
  if (familyId === "new") {
    const family = z.object(familyFields).safeParse(form(formData, ["parentName", "parentEmail", "reportLang", "rate"]));
    if (!family.success) return back("/app/students", "?error=family");
    const { data, error } = await supabase
      .from("tutor_families")
      .insert({
        tutor_id: profile.id,
        parent_name: family.data.parentName,
        parent_email: family.data.parentEmail,
        report_lang: family.data.reportLang,
        rate_cents_override: family.data.rate,
      })
      .select("id")
      .single();
    if (error) return back("/app/students", "?error=family");
    familyId = data.id;
  }

  const { data: student, error } = await supabase
    .from("tutor_students")
    .insert({
      tutor_id: profile.id,
      family_id: familyId,
      first_name: parsed.data.firstName,
      last_initial: parsed.data.lastInitial,
      year_level: parsed.data.yearLevel,
      subjects: parsed.data.subjects,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();
  if (error) return back("/app/students", "?error=student");
  const next = String(formData.get("next") ?? "");
  if (next === "log") return back("/app/log", `?student=${student.id}`);
  return back("/app/students", "?saved=student");
}

export async function updateFamily(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = z.object(familyFields).safeParse(form(formData, ["parentName", "parentEmail", "reportLang", "rate"]));
  if (!id.success) return back("/app/students");
  if (!parsed.success) return back(`/app/families/${id.data}`, "?error=family");
  const { error } = await (await createClient())
    .from("tutor_families")
    .update({
      parent_name: parsed.data.parentName,
      parent_email: parsed.data.parentEmail,
      report_lang: parsed.data.reportLang,
      rate_cents_override: parsed.data.rate,
    })
    .eq("id", id.data);
  return back(`/app/families/${id.data}`, error ? "?error=family" : "?saved=family");
}

export async function deleteFamily(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  // Refused by the database while the family has invoices or logged sessions (on delete restrict).
  const { error } = await (await createClient()).from("tutor_families").delete().eq("id", id);
  if (error) return back(`/app/families/${id}`, "?error=delete");
  return back("/app/students", "?saved=deleted");
}

// --- Students ----------------------------------------------------------------------------------

export async function updateStudent(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = z
    .object({ ...studentFields, familyId: z.uuid() })
    .safeParse(form(formData, ["firstName", "lastInitial", "yearLevel", "subjects", "notes", "familyId"]));
  if (!id.success) return back("/app/students");
  if (!parsed.success) return back(`/app/students/${id.data}`, "?error=student");
  const { error } = await (await createClient())
    .from("tutor_students")
    .update({
      family_id: parsed.data.familyId,
      first_name: parsed.data.firstName,
      last_initial: parsed.data.lastInitial,
      year_level: parsed.data.yearLevel,
      subjects: parsed.data.subjects,
      notes: parsed.data.notes || null,
    })
    .eq("id", id.data);
  return back(`/app/students/${id.data}`, error ? "?error=student" : "?saved=student");
}

export async function deleteStudent(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const { error } = await (await createClient()).from("tutor_students").delete().eq("id", id);
  if (error) return back(`/app/students/${id}`, "?error=delete");
  return back("/app/students", "?saved=deleted");
}

/** Delete a logged session that isn't on an invoice (and its report). */
export async function deleteSession(formData: FormData) {
  await requireTutorAction();
  const id = z.uuid().parse(formData.get("id"));
  const returnTo = z.string().regex(/^\/app(\/[\w/-]*)?$/).catch("/app").parse(formData.get("returnTo"));
  const { error } = await (await createClient()).from("tutor_sessions").delete().eq("id", id).is("invoice_id", null);
  return back(returnTo, error ? "?error=session" : "?saved=session-deleted");
}

// --- Settings ----------------------------------------------------------------------------------

export async function saveSettings(formData: FormData) {
  const { profile } = await requireTutorAction();
  const parsed = z
    .object({
      displayName: text(80).min(1),
      businessName: text(120),
      abn: z
        .string()
        .transform((v) => v.replace(/\s/g, ""))
        .pipe(z.union([z.string().regex(/^\d{11}$/), z.literal("")])),
      gstRegistered: z.enum(["on", ""]).transform((v) => v === "on"),
      rate: dollars.pipe(z.number().int().min(0).max(100000)),
      dueDays: z.coerce.number().int().min(0).max(90),
      reminders: z.enum(["on", ""]).transform((v) => v === "on"),
      langs: z.array(z.enum(["en", "zh-CN"])).min(1),
      bankAccountName: text(120),
      bsb: z
        .string()
        .transform((v) => v.replace(/[\s-]/g, ""))
        .pipe(z.union([z.string().regex(/^\d{6}$/), z.literal("")])),
      accountNumber: z
        .string()
        .transform((v) => v.replace(/[\s-]/g, ""))
        .pipe(z.union([z.string().regex(/^\d{4,10}$/), z.literal("")])),
      clearBank: z.enum(["on", ""]).transform((v) => v === "on"),
    })
    .safeParse({
      ...form(formData, ["displayName", "businessName", "abn", "rate", "dueDays", "bankAccountName", "bsb", "accountNumber"]),
      gstRegistered: formData.get("gstRegistered") ?? "",
      reminders: formData.get("reminders") ?? "",
      clearBank: formData.get("clearBank") ?? "",
      langs: formData.getAll("langs"),
    });
  if (!parsed.success) return back("/app/settings", "?error=settings");
  const s = parsed.data;
  if (s.gstRegistered && !s.abn) return back("/app/settings", "?error=abn");

  const update: Record<string, unknown> = {
    display_name: s.displayName,
    business_name: s.businessName || null,
    abn: s.abn || null,
    gst_registered: s.gstRegistered,
    default_rate_cents: s.rate,
    invoice_due_days: s.dueDays,
    overdue_reminders: s.reminders,
    report_langs: s.langs,
    bank_account_name: s.bankAccountName || null,
  };
  // Bank fields are write-only: blank keeps what's saved. Never logged.
  if (s.clearBank) {
    update.bank_bsb_enc = null;
    update.bank_acct_enc = null;
  } else {
    if (s.bsb) update.bank_bsb_enc = encryptSecret(s.bsb);
    if (s.accountNumber) update.bank_acct_enc = encryptSecret(s.accountNumber);
  }
  const { error } = await (await createClient()).from("tutors").update(update).eq("id", profile.id);
  return back("/app/settings", error ? "?error=settings" : "?saved=1");
}
