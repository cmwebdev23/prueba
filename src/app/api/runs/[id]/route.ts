import { NextResponse } from "next/server";
import { getRunState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getRunState(id);
  if (!state) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
