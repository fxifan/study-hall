import "server-only";

/**
 * Speech-to-text adapter (docs/tutor-reports-spec.md §2, §6). The audio is passed straight through
 * to the provider and never written to disk or storage, so "delete audio after transcription" holds
 * by construction: once the request ends, it's gone.
 */
export class TranscribeError extends Error {}

export function transcriptionModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
}

// Spelling hints only. Mixed English and Mandarin is expected; no language is forced.
const VOCABULARY_HINT =
  "A tutor's note after a tutoring session in Australia. May mix English and Mandarin. VCE, HSC, ATAR, SAC, Maths Methods, Specialist Maths, General Maths, Chemistry, Physics, Biology, English, EAL.";

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranscribeError("OPENAI_API_KEY is not set.");
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", transcriptionModel());
  form.append("response_format", "json");
  form.append("prompt", VOCABULARY_HINT);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new TranscribeError(`Transcription service error (${response.status}).`);
  const body = (await response.json()) as { text?: string };
  return (body.text ?? "").trim();
}
