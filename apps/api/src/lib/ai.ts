import { HttpError } from "./errors";

/**
 * Text generation. Server-side only: keys never reach the browser.
 * Order: Gemini (primary) → Groq (backup when Gemini is over its free limit, busy or down) → Gemini Flash-Lite.
 * Only send event content and counts, never students' personal details: free tiers may use prompts to improve models.
 *
 *   GEMINI_API_KEY         Google AI Studio key (primary)
 *   GEMINI_MODEL           default gemini-flash-latest
 *   GEMINI_FALLBACK_MODEL  default gemini-flash-lite-latest (last resort)
 *   GROQ_API_KEY           Groq key (backup)
 *   GROQ_MODEL             default openai/gpt-oss-120b
 */
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";

export function aiEnabled(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

export type ChatMessage = { role: "user" | "assistant"; text: string };
export type AiResult = { text: string; tokens: number; model: string };
type Opts = { system: string; prompt?: string; messages?: ChatMessage[]; json?: boolean; maxTokens?: number; temperature?: number;
  /** Per-provider wait before moving on to the next one (default 20s; Gemini sometimes hangs when overloaded) */
  timeoutMs?: number };

/** One attempt: the answer, or null to move on to the next provider (with the reason logged). */
type Attempt = (o: Opts, msgs: ChatMessage[]) => Promise<AiResult | string>;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { totalTokenCount?: number };
  error?: { message?: string };
};

function gemini(model: string): Attempt {
  return async (o, msgs) => {
    const body = {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
    };
    const config = { temperature: o.temperature ?? 0.8, maxOutputTokens: o.maxTokens ?? 2048, ...(o.json ? { responseMimeType: "application/json" } : {}) };
    // Thinking makes answers ~2x slower and isn't needed here. Some models reject the setting, so retry without it.
    for (const noThinking of [true, false]) {
      const res = await fetch(`${GEMINI}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body: JSON.stringify({ ...body, generationConfig: { ...config, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
      });
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (res.status === 400 && noThinking) continue;
      if (res.status !== 200) return `${model}: HTTP ${res.status} ${data.error?.message ?? ""}`;
      const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
      if (!text) return `${model}: empty answer (${data.candidates?.[0]?.finishReason ?? "no candidates"})`;
      return { text, tokens: data.usageMetadata?.totalTokenCount ?? 0, model };
    }
    return `${model}: rejected`;
  };
}

type GroqResponse = { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number }; error?: { message?: string } };

function groq(model: string): Attempt {
  return async (o, msgs) => {
    const res = await fetch(GROQ, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: o.system }, ...msgs.map((m) => ({ role: m.role, content: m.text }))],
        temperature: o.temperature ?? 0.8,
        // gpt-oss reasons before answering; those tokens count too, so leave room.
        max_completion_tokens: (o.maxTokens ?? 2048) + 1024,
        reasoning_effort: "low",
        ...(o.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
    });
    const data = (await res.json().catch(() => ({}))) as GroqResponse;
    if (res.status !== 200) return `groq ${model}: HTTP ${res.status} ${data.error?.message ?? ""}`;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return `groq ${model}: empty answer`;
    return { text, tokens: data.usage?.total_tokens ?? 0, model: `groq:${model}` };
  };
}

function providers(): Attempt[] {
  const list: Attempt[] = [];
  if (process.env.GEMINI_API_KEY) list.push(gemini(process.env.GEMINI_MODEL || "gemini-flash-latest"));
  if (process.env.GROQ_API_KEY) list.push(groq(process.env.GROQ_MODEL || "openai/gpt-oss-120b"));
  if (process.env.GEMINI_API_KEY) list.push(gemini(process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest"));
  return list;
}

/** A single prompt (`prompt`) or a conversation (`messages`) in, text out. Falls through the providers in order. */
export async function generate(opts: Opts): Promise<AiResult> {
  if (!aiEnabled()) throw new HttpError(503, "ai_disabled", "AI help isn't switched on yet");
  const msgs: ChatMessage[] = opts.messages ?? [{ role: "user", text: opts.prompt ?? "" }];
  const errors: string[] = [];
  for (const attempt of providers()) {
    try {
      const r = await attempt(opts, msgs);
      if (typeof r !== "string") {
        if (errors.length) console.warn(`[ai] used backup after: ${errors.join(" | ")}`);
        return r;
      }
      errors.push(r);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e)); // timeout / network
    }
  }
  console.warn(`[ai] all providers failed: ${errors.join(" | ")}`);
  throw new HttpError(503, "ai_busy", "The AI is busy right now. Please try again in a minute.");
}

/** Removes ``` fences a model sometimes wraps around HTML or JSON. */
export function stripFences(s: string): string {
  return s.trim().replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
}
