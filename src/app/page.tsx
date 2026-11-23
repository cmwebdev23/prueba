import Link from "next/link";
import { usingRemoteDb } from "@/lib/db";
import { availableProvider, providerLabel } from "@/lib/llm";
import { listRuns } from "@/lib/store";
import { NewRunForm } from "./NewRunForm";
import { RUN_STATUS } from "./labels";

export const dynamic = "force-dynamic";

export default async function Home() {
  const runs = await listRuns(20);
  const provider = availableProvider();

  return (
    <>
      <section className="intro">
        <h1>Pide un cambio y mira cómo lo resuelven tres agentes</h1>
        <p>
          El <b className="t-orchestrator">Orquestador</b> divide tu petición en tareas, <b className="t-develop">Develop</b> las
          programa sobre una web de ejemplo y <b className="t-testing">Testing</b> las comprueba y le devuelve lo que falla hasta
          que todo pasa.
        </p>
      </section>

      <NewRunForm hasAi={provider !== "mock"} aiLabel={providerLabel(provider)} />

      {!usingRemoteDb() && (
        <p className="notice">
          Aviso: no hay base de datos Turso configurada; se usa un SQLite local (en Vercel, temporal).
        </p>
      )}

      <section className="card">
        <h2>Ejecuciones recientes</h2>
        {runs.length === 0 ? (
          <p className="muted">Todavía no hay ninguna. Lanza la primera arriba.</p>
        ) : (
          <ul className="run-list">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`}>
                  <span className={`pill s-${r.status}`}>{RUN_STATUS[r.status]}</span>
                  <span className="run-req">{r.request}</span>
                  <span className="muted small">
                    {r.provider === "mock" ? "simulado" : "IA"} · {new Date(r.created_at).toLocaleString("es-ES", { timeZone: "Atlantic/Canary" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
