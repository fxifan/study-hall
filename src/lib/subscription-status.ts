/** Stripe subscription statuses that keep a family's students active (past_due is a grace period). */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;
