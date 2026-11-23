import { getVercelOidcToken } from "@vercel/oidc";
import type { Provider } from "./types";

/** Proveedor de IA disponible según las variables de entorno (sin clave → modo simulado). */
export function availableProvider(): Provider {
  if (process.env.AI_GATEWAY_API_KEY) return "gateway";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  // En Vercel, AI Gateway puede autenticarse con el token OIDC del proyecto (requiere tarjeta en la cuenta).
  if (process.env.VERCEL && process.env.AI_GATEWAY_OIDC === "1") return "gateway";
  return "mock";
}

export function providerLabel(p: Provider): string {
  switch (p) {
    case "gateway":
      return `${process.env.AI_GATEWAY_MODEL || "google/gemini-3.8-flash"} vía Vercel AI Gateway`;
    case "gemini":
      return `Gemini (${process.env.GEMINI_MODEL || "gemini-3.8-flash"})`;
    case "anthropic":
      return `Claude (${process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"})`;
    case "openai":
      return `${process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"}`;
    default:
      return "Simulado (sin IA)";
  }
}

const TIMEOUT_MS = 55_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  delays = [2000, 5000, 0]
): Promise<unknown> {
  // Reintenta los errores temporales (saturación o límite de peticiones del plan gratuito).
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= delays.length - 1) {
      throw new ApiError(`La API de IA respondió ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    await sleep(delays[attempt]);
  }
}

async function callText(provider: Exclude<Provider, "mock">, system: string, user: string): Promise<string> {
  if (provider === "gemini") {
    // Si un modelo está saturado o no disponible, se prueba el siguiente.
    const models = [
      ...new Set([
        process.env.GEMINI_MODEL || "gemini-3.8-flash",
        ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash,gemini-3.5-flash,gemini-flash-latest,gemini-2.5-flash")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      ]),
    ];
    let lastError: unknown;
    for (const model of models) {
      try {
        const data = (await post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { "x-goog-api-key": process.env.GEMINI_API_KEY! },
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          },
          [1500, 0]
        )) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        return (
          data.candidates?.[0]?.content?.parts
            ?.filter((p) => !p.thought)
            .map((p) => p.text ?? "")
            .join("") ?? ""
        );
      } catch (e) {
        lastError = e;
        if (!(e instanceof ApiError) || ![404, 429, 500, 502, 503, 504].includes(e.status)) throw e;
      }
    }
    throw lastError;
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
  const key = gateway
    ? process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken())
    : process.env.OPENAI_API_KEY;
  const data = (await post(
    `${base}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model: gateway
        ? process.env.AI_GATEWAY_MODEL || "google/gemini-3.8-flash"
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
