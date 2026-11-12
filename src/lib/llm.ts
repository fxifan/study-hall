import "server-only";

/**
 * The one LLM adapter (docs/tutor-reports-spec.md §2). Features call generateReport() /
 * translateReport() in src/lib/report/generate.ts, which take an `Llm`; swap the vendor here.
 *
 * Default: OpenAI chat completions with strict JSON-schema output, the same vendor and key as
 * transcription (one data processor to list in the privacy policy). `store: false`; OpenAI doesn't
 * train on API data by default.
 */
export type JsonRequest = { system: string; user: string; schemaName: string; schema: object };
export type JsonCompletion = { data: unknown; tokens: number; model: string };
export interface Llm {
  json(request: JsonRequest): Promise<JsonCompletion>;
}

export class LlmError extends Error {}

export function llmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function reportModel(): string {
  return process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini";
}

/** `model` defaults to the report model; the EduMi AI assistant can set OPENAI_ASSISTANT_MODEL. */
export function openAiLlm(model: string = reportModel()): Llm {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LlmError("OPENAI_API_KEY is not set.");
  return {
    async json({ system, user, schemaName, schema }) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          // Reasoning models (gpt-5*, o*) reject temperature; keep it low elsewhere.
          ...(/^(gpt-5|o\d)/.test(model) ? {} : { temperature: 0.2 }),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        // Keep only OpenAI's error type and code (e.g. invalid_api_key, model_not_found,
        // insufficient_quota): the message can echo part of the key or the request.
        const err = ((await response.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null)?.error;
        throw new LlmError(`Drafting service error (${response.status} ${err?.code ?? err?.type ?? "unknown"}).`);
      }
      const body = (await response.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null; refusal?: string | null } }[];
        usage?: { total_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new LlmError("The drafting service returned nothing.");
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new LlmError("The drafting service returned invalid JSON.");
      }
      return { data, tokens: body.usage?.total_tokens ?? 0, model: body.model ?? model };
    },
  };
}
