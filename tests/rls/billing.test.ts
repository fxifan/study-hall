/**
 * Payment -> access, against the real database, without calling Stripe: signed webhook events for a
 * fake subscription go through the real route handler. Covers the signature check, subscription
 * mirroring, student activation and auto-enrolment, and cancellation. Also session generation.
 */
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { enrolEligibleStudents, generateSessions } from "@/lib/sessions";
import { createAdminClient } from "../../scripts/lib/env";
import { SEED_IDS } from "../../scripts/seed-data";

const admin = createAdminClient();
const stamp = Date.now();
const WEBHOOK_SECRET = "whsec_test_billing_spec";
const priceId = `price_test_${stamp}`;
const subscriptionId = `sub_test_${stamp}`;
let parentId: string;
let studentId: string;
let studentProfileId: string;
let planId: string;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_offline_signature_only");

function subscription(status: Stripe.Subscription.Status) {
  return {
    id: subscriptionId,
    object: "subscription",
    customer: `cus_test_${stamp}`,
    status,
    cancel_at_period_end: false,
    metadata: { parent_id: parentId, plan_id: planId, student_ids: studentId },
    items: { data: [{ price: { id: priceId }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400 }] },
  };
}

async function deliver(type: string, object: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: `evt_${stamp}_${type}`, object: "event", type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY ||= "sk_test_offline_signature_only";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const plan = await admin
    .from("plans")
    .insert({ org_id: SEED_IDS.org, name: `Billing test ${stamp}`, price_cents: 4900, stripe_price_id: priceId, active: false })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  planId = plan.data.id;

  const parent = await admin.auth.admin.createUser({ email: `billing-parent-${stamp}@studyhall.test`, email_confirm: true });
  if (parent.error) throw parent.error;
  parentId = parent.data.user.id;
  const child = await admin.auth.admin.createUser({
    email: `billing-child-${stamp}@studyhall.test`,
    email_confirm: true,
    app_metadata: { role: "student", org_id: SEED_IDS.org },
  });
  if (child.error) throw child.error;
  studentProfileId = child.data.user.id;
  await admin.from("profiles").update({ role: "student" }).eq("id", studentProfileId);
  const student = await admin
    .from("students")
    .insert({ org_id: SEED_IDS.org, profile_id: studentProfileId, first_name: "Billing", last_initial: "T", year_level: 11 })
    .select("id")
    .single();
  if (student.error) throw student.error;
  studentId = student.data.id;
  await admin.from("parent_students").insert({ parent_id: parentId, student_id: studentId });

  await generateSessions(); // what the daily cron does
});

afterAll(async () => {
  await admin.from("subscriptions").delete().eq("stripe_subscription_id", subscriptionId);
  if (studentId) await admin.from("students").delete().eq("id", studentId);
  if (studentProfileId) await admin.auth.admin.deleteUser(studentProfileId);
  if (parentId) await admin.auth.admin.deleteUser(parentId);
  if (planId) await admin.from("plans").delete().eq("id", planId);
});

describe("session generation", () => {
  it("creates Mon–Thu 4–8pm Melbourne sessions for the next 14 days, idempotently", async () => {
    const { data } = await admin
      .from("sessions")
      .select("starts_at, ends_at")
      .eq("schedule_id", SEED_IDS.schedule)
      .gt("ends_at", new Date().toISOString());
    expect(data!.length).toBeGreaterThanOrEqual(7);
    for (const s of data!) {
      const local = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", weekday: "short", hour: "numeric", hour12: false }).format(new Date(s.starts_at));
      expect(local).toMatch(/^(Mon|Tue|Wed|Thu),? 16$/);
      expect(new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()).toBe(4 * 3600_000);
    }
    expect((await generateSessions()).created).toBe(0);
  });
});

describe("Stripe webhook", () => {
  it("rejects a bad signature", async () => {
    const res = await deliver("customer.subscription.updated", subscription("active"), "whsec_wrong");
    expect(res.status).toBe(400);
  });

  it("activates and enrols the child when the subscription is active", async () => {
    const res = await deliver("customer.subscription.created", subscription("active"));
    expect(res.status).toBe(200);

    const sub = await admin.from("subscriptions").select("parent_id, plan_id, status, quantity").eq("stripe_subscription_id", subscriptionId).single();
    expect(sub.data).toEqual({ parent_id: parentId, plan_id: planId, status: "active", quantity: 1 });
    const student = await admin.from("students").select("status").eq("id", studentId).single();
    expect(student.data?.status).toBe("active");
    const enrolments = await admin.from("enrolments").select("id").eq("student_id", studentId);
    expect(enrolments.data!.length).toBeGreaterThan(0);
    expect((await enrolEligibleStudents({ studentIds: [studentId] })).enrolled).toBe(0); // already enrolled
  });

  it("cancels access and future enrolments when the subscription ends", async () => {
    const res = await deliver("customer.subscription.deleted", subscription("canceled"));
    expect(res.status).toBe(200);
    const student = await admin.from("students").select("status").eq("id", studentId).single();
    expect(student.data?.status).toBe("cancelled");
    const enrolments = await admin.from("enrolments").select("id").eq("student_id", studentId);
    expect(enrolments.data).toEqual([]);
  });
});
