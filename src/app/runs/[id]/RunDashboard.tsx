"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentName, RunState, Task, TaskStatus } from "@/lib/types";
import { MAX_ATTEMPTS } from "@/lib/types";
import { AGENTS, AGENT_STATUS, RUN_STATUS, TASK_STATUS } from "../../labels";

const TERMINAL = ["done", "partial", "failed"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COLUMNS: { title: string; statuses: TaskStatus[] }[] = [
  { title: "Pendiente", statuses: ["pending"] },
  { title: "Desarrollo", statuses: ["developing", "changes_requested"] },
  { title: "Pruebas", statuses: ["testing"] },
  { title: "Hecho", statuses: ["passed", "failed"] },
];

export function RunDashboard({ initial }: { initial: RunState }) {
  const [state, setState] = useState(initial);
  const [netError, setNetError] = useState(false);
  const { run, tasks, agents, events, files } = state;
  const id = run.id;
  const finished = TERMINAL.includes(run.status);

  // Bucle que hace avanzar a los agentes (un paso por petición, compatible con Vercel serverless).
  useEffect(() => {
    if (TERMINAL.includes(initial.run.status)) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const res = await fetch(`/api/runs/${id}/tick`, { method: "POST" });
          const { status } = (await res.json()) as { status: string };
          setNetError(false);
          if (TERMINAL.includes(status) || status === "not_found") break;
          await sleep(status === "busy" ? 1500 : 250);
        } catch {
          setNetError(true);
          await sleep(3000);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [id, initial.run.status]);

  // Sondeo del estado para pintar en directo lo que hace cada agente.
  useEffect(() => {
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
          if (res.ok) {
            const next = (await res.json()) as RunState;
            if (!stop) setState(next);
            if (TERMINAL.includes(next.run.status)) break;
          }
        } catch {
          /* reintenta */
        }
        await sleep(1000);
      }
    })();
    return () => {
      stop = true;
    };
  }, [id]);

  const activeTaskIds = useMemo(
    () => new Set(agents.filter((a) => a.status === "working" && a.task_id).map((a) => a.task_id)),
    [agents]
  );
  const passed = tasks.filter((t) => t.status === "passed").length;

  return (
    <div className="dashboard">
      <section className="run-head">
        <div>
          <Link href="/" className="muted small">
            ← Todas las ejecuciones
          </Link>
          <h1>«{run.request}»</h1>
          <p className="muted small">
            {run.provider === "mock" ? "Modo simulado (sin IA)" : `IA: ${run.provider}`} · {passed}/{tasks.length || "–"} tareas superadas
          </p>
        </div>
        <span className={`pill big s-${run.status}`}>{RUN_STATUS[run.status]}</span>
      </section>

      {netError && <p className="notice">Sin conexión con el servidor, reintentando…</p>}
      {run.analysis && (
        <p className="analysis">
          <b className="t-orchestrator">Plan del Orquestador:</b> {run.analysis}
        </p>
      )}
      {run.summary && finished && <p className={`summary s-${run.status}`}>{run.summary}</p>}

      <section className="agents">
        {agents.map((a) => {
          const task = tasks.find((t) => t.id === a.task_id);
          return (
            <article key={a.agent} className={`agent a-${a.agent} st-${a.status}`}>
              <header>
                <span className={`dot c-${a.agent}`} />
                <h2>{AGENTS[a.agent].name}</h2>
                <span className={`pill st-${a.status}`}>{AGENT_STATUS[a.status]}</span>
              </header>
              <p className="muted small">{AGENTS[a.agent].role}</p>
              <p className="agent-note">{a.note ?? "—"}</p>
              {task && <p className="small agent-task">Tarea: {task.title}</p>}
              {a.status === "working" && <div className="bar" aria-hidden />}
            </article>
          );
        })}
      </section>

      <section className="board">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
          return (
            <div key={col.title} className="column">
              <h3>
                {col.title} <span className="muted">{colTasks.length}</span>
              </h3>
              {colTasks.map((t) => (
                <TaskCard key={t.id} task={t} total={tasks.length} active={activeTaskIds.has(t.id)} />
              ))}
              {colTasks.length === 0 && <p className="empty">{run.status === "planning" && col.title === "Pendiente" ? "El Orquestador está planificando…" : "—"}</p>}
            </div>
          );
        })}
      </section>

      <div className="split">
        <Timeline events={events} tasks={tasks} />
        <Preview runId={id} files={files} />
      </div>
    </div>
  );
}

function TaskCard({ task, total, active }: { task: Task; total: number; active: boolean }) {
  return (
    <article className={`task ts-${task.status} ${active ? "active" : ""}`}>
      <div className="task-top">
        <span className="muted small">
          {task.position + 1}/{total}
        </span>
        <span className={`pill ts-${task.status}`}>{TASK_STATUS[task.status]}</span>
      </div>
      <h4>{task.title}</h4>
      {task.attempts > 0 && (
        <p className="muted small">
          Intento {task.attempts}/{MAX_ATTEMPTS}
        </p>
      )}
      {task.feedback && task.feedback.length > 0 && (
        <ul className="issues">
          {task.feedback.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>Detalles</summary>
        <p className="small">{task.description}</p>
        {task.criteria.length > 0 && (
          <>
            <p className="small label">Criterios de aceptación</p>
            <ul className="small">
              {task.criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </>
        )}
        {task.checks.length > 0 && (
          <>
            <p className="small label">Comprobaciones automáticas</p>
            <ul className="small mono">
              {task.checks.map((c, i) => (
                <li key={i}>
                  {c.type === "file_exists" ? `existe ${c.path}` : `${c.path} ${c.type === "contains" ? "contiene" : "no contiene"} ${c.text}`}
                </li>
              ))}
            </ul>
          </>
        )}
        {task.last_change && <p className="small">Último cambio de Develop: {task.last_change.summary}</p>}
      </details>
    </article>
  );
}

function Timeline({ events, tasks }: { events: RunState["events"]; tasks: Task[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <section className="card timeline">
      <h2>Conversación entre agentes</h2>
      <ol ref={ref}>
        {events.map((e) => {
          const issues = (e.data as { issues?: string[] } | null)?.issues;
          const task = tasks.find((t) => t.id === e.task_id);
          return (
            <li key={e.id} className={`ev k-${e.kind}`}>
              <span className={`dot c-${e.agent}`} />
              <div>
                <p className="ev-head">
                  <b className={`t-${e.agent}`}>{AGENTS[e.agent as AgentName | "system"]?.name ?? e.agent}</b>
                  <span className="muted small">
                    {new Date(e.created_at).toLocaleTimeString("es-ES", { timeZone: "Atlantic/Canary" })}
                    {task ? ` · tarea ${task.position + 1}` : ""}
                  </span>
                </p>
                <p>{e.message}</p>
                {e.kind === "fail" && issues && issues.length > 0 && (
                  <ul className="issues">
                    {issues.map((i, n) => (
                      <li key={n}>{i}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Preview({ runId, files }: { runId: string; files: RunState["files"] }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const htmlPages = files.filter((f) => f.path.endsWith(".html")).map((f) => f.path);
  const [page, setPage] = useState("index.html");
  const [codeFile, setCodeFile] = useState("index.html");
  const version = Math.max(0, ...files.map((f) => f.updated_at));
  const seedTime = Math.min(...files.map((f) => f.updated_at));
  const current = files.find((f) => f.path === codeFile);

  return (
    <section className="card preview">
      <div className="tabs">
        <button className={tab === "preview" ? "on" : ""} onClick={() => setTab("preview")}>
          Vista previa
        </button>
        <button className={tab === "code" ? "on" : ""} onClick={() => setTab("code")}>
          Código ({files.length})
        </button>
        {tab === "preview" ? (
          <select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Página">
            {htmlPages.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        ) : (
          <select value={codeFile} onChange={(e) => setCodeFile(e.target.value)} aria-label="Archivo">
            {files.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
                {f.updated_at > seedTime ? " •" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === "preview" ? (
        <iframe
          key={`${page}-${version}`}
          title="Vista previa de la web"
          src={`/api/runs/${runId}/site/${page}?v=${version}`}
          sandbox="allow-scripts"
        />
      ) : (
        <pre className="code">{current?.content ?? ""}</pre>
      )}
      <p className="muted small">• = archivo creado o modificado por Develop</p>
    </section>
  );
}
