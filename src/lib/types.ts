export type AgentName = "orchestrator" | "develop" | "testing";
export type AgentStatus = "idle" | "working" | "waiting" | "done" | "error";
export type RunStatus = "planning" | "working" | "done" | "partial" | "failed";
export type TaskStatus = "pending" | "developing" | "testing" | "changes_requested" | "passed" | "failed";
export type Provider = "gemini" | "anthropic" | "openai" | "mock";

export type Check =
  | { type: "file_exists"; path: string }
  | { type: "contains"; path: string; text: string }
  | { type: "not_contains"; path: string; text: string };

export interface Run {
  id: string;
  request: string;
  status: RunStatus;
  provider: Provider;
  analysis: string | null;
  summary: string | null;
  errors: number;
  created_at: number;
  updated_at: number;
}

export interface Task {
  id: string;
  run_id: string;
  position: number;
  title: string;
  description: string;
  criteria: string[];
  checks: Check[];
  status: TaskStatus;
  attempts: number;
  feedback: string[] | null;
  last_change: { summary: string; paths: string[] } | null;
  updated_at: number;
}

export interface AgentState {
  agent: AgentName;
  status: AgentStatus;
  task_id: string | null;
  note: string | null;
  updated_at: number;
}

export interface RunEvent {
  id: number;
  task_id: string | null;
  agent: AgentName | "system";
  kind: "info" | "assign" | "result" | "pass" | "fail" | "error";
  message: string;
  data: unknown;
  created_at: number;
}

export interface SiteFile {
  path: string;
  content: string;
  updated_at: number;
}

export interface RunState {
  run: Run;
  tasks: Task[];
  agents: AgentState[];
  events: RunEvent[];
  files: SiteFile[];
}

export type Files = Record<string, string>;

export const MAX_ATTEMPTS = 3;
