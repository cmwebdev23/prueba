import { NextResponse } from "next/server";
import { tick } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Avanza la ejecución un paso (una llamada a un agente). La interfaz lo llama en bucle. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await tick(id);
  return NextResponse.json(result, { status: result.status === "not_found" ? 404 : 200 });
}
