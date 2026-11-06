import { BRAND } from "@/lib/brand";

/**
 * The Edumi wordmark: "edumi." in lowercase Manrope, with the full stop in sage.
 * Text, so it inherits colour and works on light and dark backgrounds. `product` adds a quieter
 * product label after it (e.g. "for Tutors").
 */
export function Wordmark({ className = "", product }: { className?: string; product?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span
        aria-label={BRAND.name}
        className="font-[family-name:var(--font-manrope)] text-[1.35em] leading-none font-extrabold tracking-[-0.04em]"
      >
        <span aria-hidden="true">
          {BRAND.wordmark}
          <span className="text-[var(--wordmark-dot,#5B7667)]">.</span>
        </span>
      </span>
      {product && <span className="text-[0.8em] font-medium opacity-70">{product}</span>}
    </span>
  );
}
