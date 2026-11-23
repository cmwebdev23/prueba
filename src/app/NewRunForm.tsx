"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "Añade una página de contacto a esta web",
  "Añade una sección de preguntas frecuentes con 4 preguntas",
  "Añade una página de horarios con una tabla de lunes a domingo",
];

export function NewRunForm({ hasAi, aiLabel }: { hasAi: boolean; aiLabel: string }) {
  const router = useRouter();
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [mode, setMode] = useState<"ai" | "mock">(hasAi ? "ai" : "mock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear");
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="card new-run" onSubmit={submit}>
      <label htmlFor="request">Petición para el equipo</label>
      <textarea id="request" value={request} onChange={(e) => setRequest(e.target.value)} rows={3} maxLength={1000} />
      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button type="button" key={ex} className="chip" onClick={() => setRequest(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <fieldset className="modes">
        <legend className="sr-only">Modo</legend>
        <label className={mode === "ai" ? "on" : ""} aria-disabled={!hasAi}>
          <input type="radio" name="mode" checked={mode === "ai"} disabled={!hasAi} onChange={() => setMode("ai")} />
          IA real <span className="muted small">{hasAi ? aiLabel : "(sin clave configurada)"}</span>
        </label>
        <label className={mode === "mock" ? "on" : ""}>
          <input type="radio" name="mode" checked={mode === "mock"} onChange={() => setMode("mock")} />
          Simulado <span className="muted small">sin IA, para ver el flujo</span>
        </label>
      </fieldset>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Creando…" : "Lanzar al equipo"}
      </button>
    </form>
  );
}
