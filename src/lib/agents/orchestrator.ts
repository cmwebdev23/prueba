import { callJson, filesForPrompt } from "../llm";
import type { Check, Files, Provider } from "../types";
import { sanitizeChecks } from "./checks";
import { mockPlan } from "./mock";

export interface PlannedTask {
  title: string;
  description: string;
  criteria: string[];
  checks: Check[];
}

export interface Plan {
  analysis: string;
  tasks: PlannedTask[];
}

const SYSTEM = `Eres el ORQUESTADOR de un equipo de tres agentes de IA (Orquestador, Develop y Testing) que modifican una web estática (HTML + CSS + JS sin frameworks ni build).
Tu trabajo: entender la petición del cliente y dividirla en entre 2 y 5 tareas pequeñas, concretas y verificables, en el orden en que deben hacerse. Develop hará cada tarea y Testing la comprobará.

Para cada tarea define:
- "title": corto, en imperativo.
- "description": qué hay que hacer exactamente y en qué archivos.
- "criteria": criterios de aceptación que Testing revisará (2-5 frases).
- "checks": comprobaciones automáticas. Tipos permitidos:
    {"type":"file_exists","path":"archivo.html"}
    {"type":"contains","path":"archivo.html","text":"texto literal que debe aparecer"}
    {"type":"not_contains","path":"archivo.html","text":"texto que no debe aparecer"}
  Usa textos literales cortos y robustos (p. ej. 'href="contacto.html"' o '<form'). No inventes textos que Develop no tenga motivo para escribir exactamente.

Reglas: rutas relativas planas (p. ej. "contacto.html", "js/app.js"); mantén el diseño y la cabecera existentes; todo en español.
Responde SOLO con JSON: {"analysis":"1-2 frases sobre cómo lo vas a abordar","tasks":[...]}`;

export async function planRequest(provider: Provider, request: string, files: Files): Promise<Plan> {
  if (provider === "mock") return mockPlan(request);

  const raw = await callJson<{ analysis?: string; tasks?: unknown[] }>(
    provider,
    SYSTEM,
    `PETICIÓN DEL CLIENTE:\n${request}\n\nARCHIVOS ACTUALES DE LA WEB:\n${filesForPrompt(files)}`
  );

  const tasks: PlannedTask[] = (raw.tasks ?? [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      title: String(t.title ?? "Tarea").slice(0, 120),
      description: String(t.description ?? "").slice(0, 2000),
      criteria: Array.isArray(t.criteria) ? t.criteria.map(String).slice(0, 8) : [],
      checks: sanitizeChecks(t.checks),
    }))
    .slice(0, 6);

  if (tasks.length === 0) throw new Error("El Orquestador no generó ninguna tarea");
  return { analysis: String(raw.analysis ?? ""), tasks };
}

export function finalSummary(request: string, results: { title: string; status: string; attempts: number }[]): string {
  const ok = results.filter((r) => r.status === "passed").length;
  const retries = results.reduce((n, r) => n + Math.max(0, r.attempts - 1), 0);
  const failed = results.filter((r) => r.status === "failed").map((r) => r.title);
  let s = `«${request}»: ${ok} de ${results.length} tareas superadas`;
  s += retries ? `, con ${retries} ${retries === 1 ? "corrección" : "correcciones"} tras las pruebas.` : " a la primera.";
  if (failed.length) s += ` No se pudo completar: ${failed.join(", ")}.`;
  return s;
}
