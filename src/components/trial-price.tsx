/**
 * A paid plan's price, selling the free trial (owner, 8 Nov 2026): the full price struck through,
 * "A$0 for N days", then the monthly price. There's no separate $0 plan: the trial is part of the
 * paid plan and starts in Checkout with a card. The strike draws in once (trial-price in globals.css).
 */
export function TrialPrice({ full, days, size = "lg" }: { full: string; days: number; size?: "lg" | "sm" }) {
  return (
    <span className={`trial-price trial-price--${size}`}>
      <span className="sr-only">
        {days} days free, then {full} a month. Cancel any time.
      </span>
      <span aria-hidden="true" className="trial-price-badge">
        {days} days free
      </span>
      <span aria-hidden="true" className="trial-price-row">
        <s className="trial-price-was">{full}</s>
        <span className="trial-price-now">A$0</span>
        <span className="trial-price-for">for {days} days</span>
      </span>
      <span aria-hidden="true" className="trial-price-then">
        then {full}/month · cancel any time
      </span>
    </span>
  );
}
