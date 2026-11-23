import { batch, exec, query } from "./db";
import { SEED_SITE } from "./seed-site";
import type {
  AgentName,
  AgentState,
  AgentStatus,
  Check,
  Files,
  Provider,
  Run,
  RunEvent,
  RunState,
  RunStatus,
  SiteFile,
  Task,
  TaskStatus,
} from "./types";

const now = () => Date.now();
const id = () => crypto.randomUUID();

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string" || v === "") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

// ---------- Runs ----------

export async function createRun(request: string, provider: Provider): Promise<string> {
  const runId = id();
  const t = now();
  await batch([
    {
      sql: `INSERT INTO runs (id, request, status, provider, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?, ?)`,
      args: [runId, request, provider, t, t],
    },
    ...Object.entries(SEED_SITE).map(([path, content]) => ({
      sql: `INSERT INTO files (run_id, path, content, updated_at) VALUES (?, ?, ?, ?)`,
      args: [runId, path, content, t],
    })),
    ...(["orchestrator", "develop", "testing"] as AgentName[]).map((agent) => ({
      sql: `INSERT INTO agents (run_id, agent, status, note, updated_at) VALUES (?, ?, 'idle', ?, ?)`,
      args: [runId, agent, agent === "orchestrator" ? "Petición recibida" : "Esperando tareas", t],
    })),
    {
      sql: `INSERT INTO events (run_id, agent, kind, message, created_at) VALUES (?, 'system', 'info', ?, ?)`,
      args: [runId, `Nueva petición: «${request}»`, t],
    },
  ]);
  return runId;
}

export async function getRun(runId: string): Promise<Run | null> {
  const rows = await query<Run>(`SELECT * FROM runs WHERE id = ?`, [runId]);
  return rows[0] ?? null;
}

export async function listRuns(limit = 20): Promise<Run[]> {
  return query<Run>(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export async function updateRun(
  runId: string,
  fields: Partial<Pick<Run, "status" | "analysis" | "summary" | "errors">>
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await exec(`UPDATE runs SET ${sets}, updated_at = ? WHERE id = ?`, [
    ...keys.map((k) => fields[k] as string | number | null),
    now(),
    runId,
  ]);
}

/** Bloqueo optimista: solo un "tick" a la vez por ejecución (aunque haya varias pestañas abiertas). */
export async function acquireLock(runId: string, ms: number): Promise<boolean> {
  const t = now();
  const changed = await exec(`UPDATE runs SET lock_until = ? WHERE id = ? AND lock_until < ?`, [t + ms, runId, t]);
  return changed === 1;
}

export async function releaseLock(runId: string): Promise<void> {
  await exec(`UPDATE runs SET lock_until = 0 WHERE id = ?`, [runId]);
}

export async function setRunStatus(runId: string, status: RunStatus) {
  await updateRun(runId, { status });
}

// ---------- Tareas ----------

interface TaskRow extends Omit<Task, "criteria" | "checks" | "feedback" | "last_change"> {
  criteria: string;
  checks: string;
  feedback: string | null;
  last_change: string | null;
}

function toTask(r: TaskRow): Task {
  return {
    ...r,
    criteria: parseJson<string[]>(r.criteria, []),
    checks: parseJson<Check[]>(r.checks, []),
    feedback: parseJson<string[] | null>(r.feedback, null),
    last_change: parseJson<Task["last_change"]>(r.last_change, null),
  };
}

export async function getTasks(runId: string): Promise<Task[]> {
  const rows = await query<TaskRow>(`SELECT * FROM tasks WHERE run_id = ? ORDER BY position`, [runId]);
  return rows.map(toTask);
}

export async function insertTasks(
  runId: string,
  tasks: { title: string; description: string; criteria: string[]; checks: Check[] }[]
): Promise<Task[]> {
  const t = now();
  const withIds = tasks.map((task, i) => ({ ...task, id: id(), position: i }));
  await batch(
    withIds.map((task) => ({
      sql: `INSERT INTO tasks (id, run_id, position, title, description, criteria, checks, status, attempts, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      args: [
        task.id,
        runId,
        task.position,
        task.title,
        task.description,
        JSON.stringify(task.criteria),
        JSON.stringify(task.checks),
        t,
      ],
    }))
  );
  return getTasks(runId);
}

export async function updateTask(
  taskId: string,
  fields: Partial<{
    status: TaskStatus;
    attempts: number;
    feedback: string[] | null;
    last_change: Task["last_change"];
  }>
): Promise<void> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const args = entries.map(([k, v]) =>
    k === "feedback" || k === "last_change" ? (v == null ? null : JSON.stringify(v)) : (v as string | number)
  );
  await exec(`UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`, [...args, now(), taskId]);
}

// ---------- Agentes y eventos ----------

export async function setAgent(
  runId: string,
  agent: AgentName,
  status: AgentStatus,
  note: string | null,
  taskId: string | null = null
): Promise<void> {
  await exec(`UPDATE agents SET status = ?, note = ?, task_id = ?, updated_at = ? WHERE run_id = ? AND agent = ?`, [
    status,
    note,
    taskId,
    now(),
    runId,
    agent,
  ]);
}

export async function logEvent(
  runId: string,
  agent: RunEvent["agent"],
  kind: RunEvent["kind"],
  message: string,
  taskId: string | null = null,
  data: unknown = null
): Promise<void> {
  await exec(`INSERT INTO events (run_id, task_id, agent, kind, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    runId,
    taskId,
    agent,
    kind,
    message,
    data == null ? null : JSON.stringify(data),
    now(),
  ]);
}

// ---------- Archivos del sitio ----------

export async function getFiles(runId: string): Promise<Files> {
  const rows = await query<SiteFile>(`SELECT path, content FROM files WHERE run_id = ? ORDER BY path`, [runId]);
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

export async function getFile(runId: string, path: string): Promise<string | null> {
  const rows = await query<{ content: string }>(`SELECT content FROM files WHERE run_id = ? AND path = ?`, [runId, path]);
  return rows[0]?.content ?? null;
}

export async function writeFiles(runId: string, files: { path: string; content: string }[]): Promise<void> {
  const t = now();
  await batch(
    files.map((f) => ({
      sql: `INSERT INTO files (run_id, path, content, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      args: [runId, f.path, f.content, t],
    }))
  );
}

// ---------- Estado completo para la interfaz ----------

export async function getRunState(runId: string): Promise<RunState | null> {
  const run = await getRun(runId);
  if (!run) return null;
  const [tasks, agents, events, files] = await Promise.all([
    getTasks(runId),
    query<AgentState>(
      `SELECT agent, status, task_id, note, updated_at FROM agents WHERE run_id = ?
       ORDER BY CASE agent WHEN 'orchestrator' THEN 0 WHEN 'develop' THEN 1 ELSE 2 END`,
      [runId]
    ),
    query<RunEvent & { data: string | null }>(
      `SELECT id, task_id, agent, kind, message, data, created_at FROM events WHERE run_id = ? ORDER BY id`,
      [runId]
    ),
    query<SiteFile>(`SELECT path, content, updated_at FROM files WHERE run_id = ? ORDER BY path`, [runId]),
  ]);
  return {
    run,
    tasks,
    agents,
    events: events.map((e) => ({ ...e, data: parseJson(e.data, null) })),
    files,
  };
}
