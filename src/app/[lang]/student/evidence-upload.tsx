"use client";

import { createClient } from "@supabase/supabase-js";
import { useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { EVIDENCE_ACCEPT, EVIDENCE_BUCKET, MAX_FILES_PER_GOAL, evidenceProblem, formatBytes, type EvidenceError } from "@/lib/evidence";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { finishEvidenceUpload, removeEvidence, startEvidenceUpload } from "./actions";

type Uploaded = { id: string; file_name: string; size_bytes: number };

/**
 * Optional photo or PDF of a task's work. The file goes straight to private storage with a
 * one-time signed URL, then the server records it. Lives inside the marking form, so its controls
 * are type="button" and the file input has no name (it isn't part of that form's data).
 */
export function EvidenceUpload({
  goalId,
  task,
  files,
  t,
}: {
  goalId: string;
  /** The task's text, for the file input's accessible name. */
  task: string;
  files: Uploaded[];
  t: Dictionary["student"]["goals"]["evidence"];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<EvidenceError | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    const problem = evidenceProblem(file);
    if (problem) return setError(problem);
    startTransition(async () => {
      const started = await startEvidenceUpload(goalId, { name: file.name, type: file.type, size: file.size });
      if (!started.ok) return setError(started.code);
      const storage = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }).storage;
      const { error: uploadError } = await storage
        .from(EVIDENCE_BUCKET)
        .uploadToSignedUrl(started.path, started.token, file, { contentType: file.type });
      if (uploadError) return setError("failed");
      const finished = await finishEvidenceUpload(goalId, started.path, file.name);
      if (!finished.ok) setError(finished.code);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`evidence-${goalId}`}>
      <p className="text-sm text-ink-soft">{t.title}</p>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2">
              <a href={`/api/evidence/${f.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {f.file_name}
              </a>
              <span className="font-mono text-xs text-ink-faint">{formatBytes(f.size_bytes)}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => void (await removeEvidence(f.id)))}
                className="text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < MAX_FILES_PER_GOAL && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={EVIDENCE_ACCEPT}
            className="sr-only"
            aria-label={`${t.add}: ${task}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="rounded-md border border-hair px-3 py-1.5 text-sm hover:border-ink-faint"
          >
            {pending ? t.uploading : t.add}
          </button>
        </div>
      )}
      <p className="text-xs text-ink-faint">{t.help}</p>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {t.errors[error]}
        </p>
      )}
    </div>
  );
}
