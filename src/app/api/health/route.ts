import { NextResponse } from "next/server";
import { query, usingRemoteDb } from "@/lib/db";
import { availableProvider, callJson } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Diagnóstico: comprueba la base de datos y (con ?ai=1) una llamada real al proveedor de IA. */
export async function GET(req: Request) {
  const out: Record<string, unknown> = { provider: availableProvider(), remoteDb: usingRemoteDb() };
  try {
    const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM runs");
    out.db = { ok: true, runs: rows[0]?.n ?? 0 };
  } catch (e) {
    out.db = { ok: false, error: String(e) };
  }
  const provider = availableProvider();
  if (new URL(req.url).searchParams.get("ai") === "1" && provider !== "mock") {
    const t = Date.now();
    try {
      const r = await callJson<{ ok?: boolean }>(provider, "Responde solo JSON.", 'Devuelve {"ok": true}');
      out.ai = { ok: r.ok === true, ms: Date.now() - t };
    } catch (e) {
      out.ai = { ok: false, error: String(e).slice(0, 400) };
    }
  }
  if (new URL(req.url).searchParams.get("models") === "1" && process.env.GEMINI_API_KEY) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
    });
    const data = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    out.models = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
