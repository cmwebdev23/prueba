/**
 * Motor del equipo de agentes.
 *
 * Cada llamada a tick() avanza UN paso (una llamada a un agente) y guarda todo en la base de datos.
 * Así ninguna función serverless de Vercel supera el límite de tiempo y la interfaz puede
 * mostrar en directo qué agente está trabajando y en qué estado está cada tarea.
 *
 *   planning ─► Orquestador divide la petición en tareas
 *   working  ─► por cada tarea: Develop ─► Testing ─┬─► superada
 *                                     ▲              └─► fallos ─► Develop (máx. 3 intentos)
 *   done / partial / failed
 */
import { developTask } from "./agents/develop";
import { MOCK_DELAY } from "./agents/mock";
import { finalSummary, planRequest } from "./agents/orchestrator";
import { testTask } from "./agents/testing";
import {
  acquireLock,
  getFiles,
  getRun,
  getTasks,
  insertTasks,
  logEvent,
  releaseLock,
  setAgent,
  updateRun,
  updateTask,
  writeFiles,
} from "./store";
import { MAX_ATTEMPTS, type Run, type Task } from "./types";

const MAX_RUN_ERRORS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TickResult = { status: Run["status"] | "busy" | "not_found" };

export async function tick(runId: string): Promise<TickResult> {
  const run = await getRun(runId);
  if (!run) return { status: "not_found" };
  if (["done", "partial", "failed"].includes(run.status)) return { status: run.status };
  if (!(await acquireLock(runId, 300_000))) return { status: "busy" };

  try {
    if (run.status === "planning") await planStep(run);
    else await workStep(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errors = run.errors + 1;
    await logEvent(runId, "system", "error", `Error (${errors}/${MAX_RUN_ERRORS}): ${message}`);
    if (errors >= MAX_RUN_ERRORS) {
      await updateRun(runId, { errors, status: "failed", summary: `Se detuvo tras ${errors} errores: ${message}` });
      for (const a of ["orchestrator", "develop", "testing"] as const) await setAgent(runId, a, "error", "Detenido por errores");
    } else {
      await updateRun(runId, { errors });
    }
  } finally {
    await releaseLock(runId);
  }
  return { status: (await getRun(runId))!.status };
}

async function planStep(run: Run) {
  await setAgent(run.id, "orchestrator", "working", "Analizando la petición y la web actual");
  const files = await getFiles(run.id);
  const plan = await planRequest(run.provider, run.request, files);
  const tasks = await insertTasks(run.id, plan.tasks);

  await updateRun(run.id, { analysis: plan.analysis, status: "working" });
  await logEvent(run.id, "orchestrator", "result", `Plan: ${plan.analysis}`, null, {
    tasks: tasks.map((t) => t.title),
  });
  await setAgent(run.id, "orchestrator", "waiting", `Supervisando ${tasks.length} tareas`);
  await setAgent(run.id, "develop", "waiting", "Tareas recibidas");
}

async function workStep(run: Run) {
  const tasks = await getTasks(run.id);
  const task = tasks.find((t) => t.status !== "passed" && t.status !== "failed");
  if (!task) return finish(run, tasks);

  const n = `${task.position + 1}/${tasks.length}`;

  if (task.status === "pending" || task.status === "changes_requested" || task.status === "developing") {
    // ----- DEVELOP -----
    if (task.status === "pending") {
      await logEvent(run.id, "orchestrator", "assign", `Asigna a Develop la tarea ${n}: ${task.title}`, task.id);
      await setAgent(run.id, "orchestrator", "waiting", `Tarea ${n} en desarrollo`, task.id);
    }
    const attempt = task.attempts + 1;
    await updateTask(task.id, { status: "developing" });
    await setAgent(
      run.id,
      "develop",
      "working",
      attempt > 1 ? `Corrigiendo la tarea ${n} (intento ${attempt})` : `Programando la tarea ${n}`,
      task.id
    );
    await setAgent(run.id, "testing", "idle", "Esperando a Develop");

    const files = await getFiles(run.id);
    const result = await developTask(run.provider, { ...task, attempts: task.attempts }, files);
    if (result.files.length) await writeFiles(run.id, result.files);

    const paths = result.files.map((f) => f.path);
    await updateTask(task.id, {
      status: "testing",
      attempts: attempt,
      last_change: { summary: result.summary, paths },
    });
    await logEvent(run.id, "develop", "result", `${result.summary} (${paths.join(", ") || "sin archivos"})`, task.id, {
      attempt,
      paths,
    });
    await setAgent(run.id, "develop", "waiting", `Entregada la tarea ${n}, esperando a Testing`, task.id);
    await setAgent(run.id, "testing", "waiting", `Tarea ${n} lista para probar`, task.id);
    return;
  }

  // ----- TESTING -----
  await setAgent(run.id, "testing", "working", `Probando la tarea ${n} (intento ${task.attempts})`, task.id);
  if (run.provider === "mock") await sleep(MOCK_DELAY);
  const files = await getFiles(run.id);
  const result = await testTask(run.provider, task, files);

  if (result.pass) {
    await updateTask(task.id, { status: "passed", feedback: null });
    await logEvent(run.id, "testing", "pass", `Tarea ${n} superada. ${result.notes}`, task.id, result);
    await setAgent(run.id, "testing", "idle", `Tarea ${n} superada`);
    await setAgent(run.id, "develop", "waiting", "Esperando la siguiente tarea");
    return;
  }

  if (task.attempts >= MAX_ATTEMPTS) {
    await updateTask(task.id, { status: "failed", feedback: result.issues });
    await logEvent(
      run.id,
      "testing",
      "fail",
      `Tarea ${n} sigue fallando tras ${task.attempts} intentos; se marca como fallida.`,
      task.id,
      result
    );
    await logEvent(run.id, "orchestrator", "info", `Da por cerrada la tarea ${n} sin éxito y sigue con el resto`, task.id);
    await setAgent(run.id, "testing", "idle", `Tarea ${n} fallida`);
    return;
  }

  await updateTask(task.id, { status: "changes_requested", feedback: result.issues });
  await logEvent(
    run.id,
    "testing",
    "fail",
    `Devuelve la tarea ${n} a Develop con ${result.issues.length} ${result.issues.length === 1 ? "fallo" : "fallos"}`,
    task.id,
    result
  );
  await setAgent(run.id, "testing", "waiting", `Esperando la corrección de la tarea ${n}`, task.id);
  await setAgent(run.id, "develop", "waiting", `Tiene fallos que corregir en la tarea ${n}`, task.id);
}

async function finish(run: Run, tasks: Task[]) {
  await setAgent(run.id, "orchestrator", "working", "Revisando el resultado final");
  const summary = finalSummary(run.request, tasks);
  const allOk = tasks.every((t) => t.status === "passed");
  await updateRun(run.id, { status: allOk ? "done" : "partial", summary });
  await logEvent(run.id, "orchestrator", allOk ? "pass" : "fail", summary);
  await setAgent(run.id, "orchestrator", "done", allOk ? "Petición completada" : "Completada con tareas fallidas");
  await setAgent(run.id, "develop", "done", "Sin tareas pendientes");
  await setAgent(run.id, "testing", "done", "Todo revisado");
}
