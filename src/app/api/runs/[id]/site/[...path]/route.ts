import { getFile } from "@/lib/store";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
};

/** Sirve la web que están construyendo los agentes, para la vista previa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const filePath = path.join("/");
  const content = await getFile(id, filePath);
  if (content === null) return new Response("No encontrado", { status: 404 });
  const ext = filePath.split(".").pop() ?? "txt";
  return new Response(content, {
    headers: {
      "content-type": TYPES[ext] ?? "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
