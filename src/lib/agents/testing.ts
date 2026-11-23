import { callJson, filesForPrompt } from "../llm";
import type { Files, Provider, Task } from "../types";
import { siteChecks, taskChecks } from "./checks";

export interface TestResult {
  pass: boolean;
  issues: string[];
  notes: string;
  automatic: { total: number; failed: number };
}

const SYSTEM = `Eres TESTING, el agente de QA de un equipo de IA que modifica una web estática.
Las comprobaciones automáticas (estructura HTML, enlaces, etiquetas de formulario y las comprobaciones de la tarea) YA han pasado.
Ahora revisa el resultado de Develop contra cada criterio de aceptación de la tarea, leyendo los archivos.
Sé estricto pero justo: marca solo fallos reales, concretos y corregibles relacionados con la tarea (no opiniones de estilo).
Responde SOLO con JSON: {"pass": true|false, "issues": ["fallo concreto y cómo detectarlo", ...], "notes": "resumen de 1 frase"}`;

export async function testTask(provider: Provider, task: Task, files: Files): Promise<TestResult> {
  // 1) Comprobaciones automáticas (siempre, también con IA real)
  const specific = taskChecks(task.checks, files);
  const global = siteChecks(files);
  const automaticIssues = [...specific, ...global];
  const automatic = { total: task.checks.length + Object.keys(files).length, failed: automaticIssues.length };

  if (automaticIssues.length > 0) {
    return {
      pass: false,
      issues: automaticIssues.slice(0, 15),
      notes: `${automaticIssues.length} comprobaciones automáticas fallan`,
      automatic,
    };
  }

  // 2) Revisión de criterios
  if (provider === "mock") {
    return { pass: true, issues: [], notes: "Todas las comprobaciones automáticas pasan", automatic };
  }

  const changed = task.last_change?.paths ?? [];
  const relevant = Object.fromEntries(
    Object.entries(files).filter(([p]) => changed.includes(p) || p.endsWith(".css"))
  );
  const raw = await callJson<{ pass?: boolean; issues?: unknown[]; notes?: string }>(
    provider,
    SYSTEM,
    `TAREA: ${task.title}\n${task.description}\n\nCRITERIOS DE ACEPTACIÓN:\n- ${task.criteria.join("\n- ")}\n\nLO QUE DICE DEVELOP: ${task.last_change?.summary ?? "-"}\n\nARCHIVOS MODIFICADOS (y CSS):\n${filesForPrompt(relevant)}\n\nOTROS ARCHIVOS EXISTENTES: ${Object.keys(files)
      .filter((p) => !(p in relevant))
      .join(", ")}`
  );
  const issues = Array.isArray(raw.issues) ? raw.issues.map(String).filter(Boolean).slice(0, 10) : [];
  const pass = raw.pass === true || (raw.pass !== false && issues.length === 0);
  return { pass, issues: pass ? [] : issues, notes: String(raw.notes ?? ""), automatic };
}
