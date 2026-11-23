import type { Provider } from "./types";

/** Proveedor de IA disponible según las variables de entorno (sin clave → modo simulado). */
export function availableProvider(): Provider {
  if (process.env.AI_GATEWAY_API_KEY) return "gateway";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export function providerLabel(p: Provider): string {
  switch (p) {
    case "gateway":
      return `${process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash"} vía Vercel AI Gateway`;
    case "gemini":
      return `Gemini (${process.env.GEMINI_MODEL || "gemini-2.5-flash"})`;
    case "anthropic":
      return `Claude (${process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"})`;
    case "openai":
      return `${process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"}`;
    default:
      return "Simulado (sin IA)";
  }
}

const TIMEOUT_MS = 55_000;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`La API de IA respondió ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function callText(provider: Exclude<Provider, "mock">, system: string, user: string): Promise<string> {
  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const data = (await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": process.env.GEMINI_API_KEY! },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
  if (provider === "anthropic") {
    const data = (await post(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      {
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
        max_tokens: 8000,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }
    )) as { content?: { type: string; text?: string }[] };
    return data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  }
  // API compatible con OpenAI: Vercel AI Gateway, Groq, OpenAI…
  const gateway = provider === "gateway";
  const base = gateway
    ? "https://ai-gateway.vercel.sh/v1"
    : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = gateway ? process.env.AI_GATEWAY_API_KEY : process.env.OPENAI_API_KEY;
  const data = (await post(
    `${base}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model: gateway
        ? process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash"
        : process.env.OPENAI_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }
  )) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Extrae el primer objeto JSON de la respuesta (tolera ```json ... ``` y texto alrededor). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("La IA no devolvió JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function callJson<T>(provider: Exclude<Provider, "mock">, system: string, user: string): Promise<T> {
  const text = await callText(provider, system, user);
  try {
    return extractJson(text) as T;
  } catch {
    // Un reintento pidiendo explícitamente solo JSON.
    const retry = await callText(provider, system, `${user}\n\nIMPORTANTE: responde únicamente con un objeto JSON válido.`);
    return extractJson(retry) as T;
  }
}

export function filesForPrompt(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `=== ${path} ===\n${content}`)
    .join("\n\n");
}
