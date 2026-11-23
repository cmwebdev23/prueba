import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * Conexión a la base de datos.
 * - En producción: Turso (libSQL/SQLite en la nube, plan gratuito).
 * - En local: un archivo SQLite (file:local.db), mismo SQL y mismo cliente.
 */
let client: Client | null = null;
let ready: Promise<void> | null = null;

export function dbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  // En Vercel sin Turso solo se puede escribir en /tmp (efímero, solo para no romper la demo).
  return process.env.VERCEL ? "file:/tmp/agents.db" : "file:local.db";
}

export function usingRemoteDb(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

function getClient(): Client {
  if (!client) {
    client = createClient({ url: dbUrl(), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    request TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    analysis TEXT,
    summary TEXT,
    errors INTEGER NOT NULL DEFAULT 0,
    lock_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    criteria TEXT NOT NULL,
    checks TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    last_change TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tasks_run ON tasks(run_id, position)`,
  `CREATE TABLE IF NOT EXISTS agents (
    run_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    status TEXT NOT NULL,
    task_id TEXT,
    note TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, agent)
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    task_id TEXT,
    agent TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS events_run ON events(run_id, id)`,
  `CREATE TABLE IF NOT EXISTS files (
    run_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, path)
  )`,
];

async function db(): Promise<Client> {
  const c = getClient();
  if (!ready) {
    ready = c
      .batch(SCHEMA, "write")
      .then(() => undefined)
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  await ready;
  return c;
}

export async function query<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await (await db()).execute({ sql, args });
  // Convertimos las filas de libSQL en objetos planos serializables.
  return res.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    res.columns.forEach((col, i) => {
      const v = row[i];
      obj[col] = typeof v === "bigint" ? Number(v) : v;
    });
    return obj as T;
  });
}

export async function exec(sql: string, args: InValue[] = []): Promise<number> {
  const res = await (await db()).execute({ sql, args });
  return res.rowsAffected;
}

export async function batch(stmts: { sql: string; args: InValue[] }[]): Promise<void> {
  if (stmts.length === 0) return;
  await (await db()).batch(stmts, "write");
}
