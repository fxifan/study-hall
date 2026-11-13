import "server-only";
import { track } from "@/lib/events";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFERRAL_CREDIT_CENTS, REFERRAL_FREE_DAYS } from "./config";
import { newReferralCode } from "./referral-code";

export { newReferralCode, normaliseReferralCode } from "./referral-code";

/**
 * Tutor referrals (docs/tutor-free-and-referrals.md). Each tutor has an 8-character code for a link
 * like /tutors?ref=AB3D5F7H. A tutor who signs up through it is "referred". The first time a
 * referred tutor pays for Solo (an active subscription, not the trial), both get one month free:
 * - paying on Solo: a A$15 credit on their Stripe balance, used by the next invoice;
 * - not paying: 30 more days of full access (trial_ends_at moves out).
 * referral_rewarded_at on the referred tutor makes the reward happen once.
 */
/** The tutor's referral code, made on first use. */
export async function referralCodeFor(tutorId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("tutors").select("referral_code").eq("id", tutorId).single();
  if (data?.referral_code) return data.referral_code as string;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newReferralCode();
    const { data: set, error } = await admin.from("tutors").update({ referral_code: code }).eq("id", tutorId).is("referral_code", null).select("referral_code").maybeSingle();
    if (!error && set) return set.referral_code as string;
    if (error && error.code !== "23505") throw error; // 23505: code taken, try another
    if (!error) {
      // Another request set it first: use theirs.
      const { data: again } = await admin.from("tutors").select("referral_code").eq("id", tutorId).single();
      if (again?.referral_code) return again.referral_code as string;
    }
  }
  throw new Error("Couldn't make a referral code.");
}

/** The referring tutor for a code, if it's real (and not the tutor themselves). */
export async function referrerFor(code: string | null, newTutorId?: string): Promise<string | null> {
  if (!code) return null;
  const { data } = await createAdminClient().from("tutors").select("id").eq("referral_code", code).maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  return id && id !== newTutorId ? id : null;
}

export type ReferralStats = { signedUp: number; rewarded: number };

export async function referralStats(tutorId: string): Promise<ReferralStats> {
  const admin = createAdminClient();
  const [all, rewarded] = await Promise.all([
    admin.from("tutors").select("id", { count: "exact", head: true }).eq("referred_by", tutorId),
    admin.from("tutors").select("id", { count: "exact", head: true }).eq("referred_by", tutorId).not("referral_rewarded_at", "is", null),
  ]);
  return { signedUp: all.count ?? 0, rewarded: rewarded.count ?? 0 };
}

/** One month free for one tutor: Stripe credit if they're paying for Solo, otherwise extra days. */
async function giveFreeMonth(tutorId: string, why: string): Promise<"credit" | "days"> {
  const admin = createAdminClient();
  const { data: t } = await admin.from("tutors").select("plan, trial_ends_at, stripe_customer_id").eq("id", tutorId).single();
  if (t?.plan === "solo" && t.stripe_customer_id && stripeConfigured()) {
    await getStripe().customers.createBalanceTransaction(
      t.stripe_customer_id as string,
      { amount: -REFERRAL_CREDIT_CENTS, currency: "aud", description: `Edumi for Tutors: free month (${why})` },
      { idempotencyKey: `tutor-referral-credit:${tutorId}:${why}` },
    );
    return "credit";
  }
  const from = Math.max(Date.now(), Date.parse((t?.trial_ends_at as string) ?? new Date().toISOString()));
  await admin.from("tutors").update({ trial_ends_at: new Date(from + REFERRAL_FREE_DAYS * 86_400_000).toISOString() }).eq("id", tutorId);
  return "days";
}

/**
 * Call when a tutor's subscription becomes active (paid, not trialing). If they were referred and
 * haven't been rewarded, claim the reward (atomically) and give both tutors a free month.
 */
export async function rewardReferralIfDue(tutorId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: claimed, error } = await admin
    .from("tutors")
    .update({ referral_rewarded_at: new Date().toISOString() })
    .eq("id", tutorId)
    .not("referred_by", "is", null)
    .is("referral_rewarded_at", null)
    .select("referred_by")
    .maybeSingle();
  if (error) throw error;
  if (!claimed?.referred_by) return false;
  const referrer = claimed.referred_by as string;
  try {
    const [forReferred, forReferrer] = await Promise.all([giveFreeMonth(tutorId, `referred by ${referrer.slice(0, 8)}`), giveFreeMonth(referrer, `referred ${tutorId.slice(0, 8)}`)]);
    await track({ name: "tutor_referral_rewarded", product: "tutors", role: "tutor", userId: referrer, props: { kind: `${forReferrer}/${forReferred}` }, dedupeKey: `referral:${tutorId}` });
    return true;
  } catch (e) {
    // Undo the claim so the next webhook retries the reward.
    await admin.from("tutors").update({ referral_rewarded_at: null }).eq("id", tutorId);
    throw e;
  }
}
