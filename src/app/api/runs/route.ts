import { NextResponse } from "next/server";
import { availableProvider } from "@/lib/llm";
import { createRun, listRuns } from "@/lib/store";
import type { Provider } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: await listRuns(30) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { request?: string; mode?: string };
  const request = (body.request ?? "").trim();
  if (request.length < 5 || request.length > 1000) {
    return NextResponse.json({ error: "Escribe una petición de entre 5 y 1000 caracteres." }, { status: 400 });
  }
  const real = availableProvider();
  const provider: Provider = body.mode === "mock" ? "mock" : real;
  const id = await createRun(request, provider);
  return NextResponse.json({ id });
}
