import { callJson, filesForPrompt } from "../llm";
import type { Files, Provider, Task } from "../types";
import { isSafePath, normalizePath } from "./checks";
import { mockDevelop } from "./mock";

export interface DevResult {
  summary: string;
  files: { path: string; content: string }[];
}

const SYSTEM = `Eres DEVELOP, el agente desarrollador de un equipo de IA que modifica una web estática (HTML + CSS + JS sin frameworks).
Recibes una tarea del Orquestador, sus criterios de aceptación, las comprobaciones automáticas que pasará Testing, todos los archivos actuales y, si es un reintento, los fallos que encontró Testing.

Reglas:
- Haz SOLO lo que pide la tarea, respetando el estilo, la cabecera y la navegación existentes.
- HTML válido y accesible: lang en <html>, <title>, cada campo de formulario con su <label for="...">.
- Enlaces internos solo a archivos que existan o que crees tú.
- Si hay fallos de Testing, corrígelos todos.
- Devuelve el contenido COMPLETO de cada archivo que crees o modifiques (no diffs, no "..."). No incluyas archivos sin cambios.

Responde SOLO con JSON: {"summary":"qué has hecho, 1-2 frases","files":[{"path":"archivo.html","content":"..."}]}`;

export async function developTask(provider: Provider, task: Task, files: Files): Promise<DevResult> {
  if (provider === "mock") return mockDevelop(task, files);

  const feedback = task.feedback?.length
    ? `\n\nFALLOS DETECTADOS POR TESTING EN EL INTENTO ANTERIOR (corrígelos):\n- ${task.feedback.join("\n- ")}`
    : "";
  const raw = await callJson<{ summary?: string; files?: unknown[] }>(
    provider,
    SYSTEM,
    `TAREA: ${task.title}\n${task.description}\n\nCRITERIOS DE ACEPTACIÓN:\n- ${task.criteria.join("\n- ")}\n\nCOMPROBACIONES AUTOMÁTICAS:\n${JSON.stringify(task.checks, null, 2)}${feedback}\n\nARCHIVOS ACTUALES:\n${filesForPrompt(files)}`
  );

  const out = (raw.files ?? [])
    .filter((f): f is { path: string; content: string } => {
      const r = f as Record<string, unknown>;
      return typeof r?.path === "string" && typeof r?.content === "string";
    })
    .map((f) => ({ path: normalizePath(f.path), content: f.content }))
    .filter((f) => isSafePath(f.path) && f.content.length < 200_000);

  if (out.length === 0) throw new Error("Develop no devolvió ningún archivo válido");
  return { summary: String(raw.summary ?? "Cambios aplicados"), files: out };
}
