// Shared class names and labels for the tutor app (safe in Client Components).

// Buttons, fields and cards use the site-wide classes in src/app/ui.css.
export const field = "dash-field";
export const labelClass = "flex flex-col gap-1.5 text-sm font-medium";
export const card = "dash-card p-4";
export const primaryButton = "dash-btn dash-btn--primary";
export const secondaryButton = "dash-btn dash-btn--secondary";
export const tertiaryButton = "dash-btn dash-btn--ghost";

export const YEAR_LEVELS = Array.from({ length: 13 }, (_, i) => ({ value: i, label: i === 0 ? "Foundation" : `Year ${i}` }));
export function yearLabel(year: number): string {
  return year === 0 ? "Foundation" : `Year ${year}`;
}
export const LANG_LABELS = { en: "English", "zh-CN": "简体中文", both: "English + 简体中文" } as const;

export const STATUS_STYLE = {
  draft: "border-hair text-ink-soft",
  sent: "border-[var(--dash-accent-line)] bg-[var(--dash-accent-soft)] text-[var(--dash-accent-text)]",
  overdue: "border-pen text-pen",
  paid: "border-hair bg-paper-deep text-ink-soft",
} as const;
