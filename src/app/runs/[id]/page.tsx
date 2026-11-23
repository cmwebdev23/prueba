import { notFound } from "next/navigation";
import { getRunState } from "@/lib/store";
import { RunDashboard } from "./RunDashboard";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getRunState(id);
  if (!state) notFound();
  return <RunDashboard initial={state} />;
}
