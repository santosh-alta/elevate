import { HttpError } from "./errors";

/**
 * Text generation with Google Gemini (free tier). Server-side only: the key never reaches the browser.
 * Only event content is sent (titles, descriptions, dates). Never send students' personal details:
 * on the free tier Google may use prompts to improve its products.
 *
 *   GEMINI_API_KEY         required to switch AI help on
 *   GEMINI_MODEL           default gemini-flash-latest (good writing, ~8s with thinking off)
 *   GEMINI_FALLBACK_MODEL  default gemini-flash-lite-latest (used when the main model is busy or over its free limit)
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function aiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function models(): string[] {
  return [
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest",
  ].filter((m, i, all) => all.indexOf(m) === i);
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { totalTokenCount?: number };
  error?: { message?: string };
};

export type AiResult = { text: string; tokens: number; model: string };

async function call(model: string, body: unknown): Promise<{ status: number; data: GeminiResponse }> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  return { status: res.status, data };
}

/** One prompt in, text out. Tries the main model (thinking off for speed), then the fallback model. */
export async function generate(opts: { system: string; prompt: string; json?: boolean; maxTokens?: number; temperature?: number }): Promise<AiResult> {
  if (!aiEnabled()) throw new HttpError(503, "ai_disabled", "AI writing help isn't switched on yet");
  const generationConfig = {
    temperature: opts.temperature ?? 0.8,
    maxOutputTokens: opts.maxTokens ?? 2048,
    ...(opts.json ? { responseMimeType: "application/json" } : {}),
  };
  const base = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
  };
  let lastError = "";
  for (const model of models()) {
    // Thinking makes answers ~2x slower and isn't needed for copywriting. Some models reject the setting, so retry without it.
    for (const noThinking of [true, false]) {
      let r: { status: number; data: GeminiResponse };
      try {
        r = await call(model, { ...base, generationConfig: { ...generationConfig, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        break; // timeout / network: try the next model
      }
      if (r.status === 400 && noThinking) continue;
      if (r.status !== 200) {
        lastError = `${model}: HTTP ${r.status} ${r.data.error?.message ?? ""}`;
        break;
      }
      const parts = r.data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
      if (!text) {
        lastError = `${model}: empty answer (${r.data.candidates?.[0]?.finishReason ?? "no candidates"})`;
        break;
      }
      return { text, tokens: r.data.usageMetadata?.totalTokenCount ?? 0, model };
    }
  }
  console.warn(`[ai] all models failed: ${lastError}`);
  throw new HttpError(503, "ai_busy", "The AI is busy right now. Please try again in a minute.");
}

/** Removes ``` fences a model sometimes wraps around HTML or JSON. */
export function stripFences(s: string): string {
  return s.trim().replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
}
