// Shared class names and labels for the tutor app (safe in Client Components).

export const field = "h-11 w-full rounded-lg border border-input bg-sheet px-3 text-base sm:h-9 sm:text-sm";
export const labelClass = "flex flex-col gap-1.5 text-sm font-medium";
export const card = "rounded-lg border border-hair bg-sheet p-4";
export const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-base font-medium text-paper hover:bg-ink/85 disabled:opacity-50 sm:h-9 sm:text-sm";
export const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg border border-hair bg-sheet px-4 text-base hover:bg-paper-deep disabled:opacity-50 sm:h-9 sm:text-sm";

export const YEAR_LEVELS = Array.from({ length: 13 }, (_, i) => ({ value: i, label: i === 0 ? "Foundation" : `Year ${i}` }));
export function yearLabel(year: number): string {
  return year === 0 ? "Foundation" : `Year ${year}`;
}
export const LANG_LABELS = { en: "English", "zh-CN": "简体中文", both: "English + 简体中文" } as const;

export const STATUS_STYLE = {
  draft: "border-hair text-ink-soft",
  sent: "border-ink text-ink",
  overdue: "border-pen text-pen",
  paid: "border-hair bg-paper-deep text-ink-soft",
} as const;
