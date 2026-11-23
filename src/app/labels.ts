import type { AgentName, AgentStatus, RunStatus, TaskStatus } from "@/lib/types";

export const RUN_STATUS: Record<RunStatus, string> = {
  planning: "Planificando",
  working: "En curso",
  done: "Completada",
  partial: "Con fallos",
  failed: "Detenida",
};

export const TASK_STATUS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  developing: "En desarrollo",
  testing: "En pruebas",
  changes_requested: "Cambios pedidos",
  passed: "Superada",
  failed: "Fallida",
};

export const AGENT_STATUS: Record<AgentStatus, string> = {
  idle: "Inactivo",
  working: "Trabajando",
  waiting: "En espera",
  done: "Terminado",
  error: "Error",
};

export const AGENTS: Record<AgentName | "system", { name: string; role: string }> = {
  orchestrator: { name: "Orquestador", role: "Divide la petición y reparte las tareas" },
  develop: { name: "Develop", role: "Programa cada tarea" },
  testing: { name: "Testing", role: "Comprueba y devuelve lo que falla" },
  system: { name: "Sistema", role: "" },
};
