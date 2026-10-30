/**
 * Work evidence (photos or PDFs a student adds to a task). Shared rules for the browser and server;
 * the bucket and table (migration session_checklist_and_evidence) enforce the same limits.
 */
export const EVIDENCE_BUCKET = "work-evidence";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_GOAL = 3;
export const EVIDENCE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_TYPES).join(",");

export type EvidenceError = "type" | "size" | "count" | "failed";

export function evidenceProblem(file: { type: string; size: number }): EvidenceError | null {
  if (!(file.type in EVIDENCE_TYPES)) return "type";
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) return "size";
  return null;
}

/** A display name with only safe characters (the stored object is named by a random id). */
export function safeFileName(name: string, contentType: string): string {
  const ext = EVIDENCE_TYPES[contentType] ?? "bin";
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_\- ]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "work"}.${ext}`;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
