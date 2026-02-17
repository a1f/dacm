export interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
}

export type TaskStatus = "running" | "waiting" | "completed" | "failed" | "archived";

export interface Task {
  id: number;
  name: string;
  description: string;
  summary: string;
  task_id: string | null;
  project_id: number;
  status: TaskStatus;
  start_time: string | null;
  iteration_count: number;
  worktree_path: string | null;
  branch_name: string | null;
  created_at: string;
}

export interface TaskStatusChangedEvent {
  task_id: number;
  status: TaskStatus;
}

export type SessionStatus = "running" | "exited";

export interface Setting {
  key: string;
  value: string;
}

export type ThemeMode = "light" | "dark" | "system";

export type SettingsPage = "general" | "worktrees" | "archived";

export interface SessionInfo {
  session_id: string;
  task_id: number;
  project_id: number;
  pid: number | null;
  uptime_secs: number;
  started_at_epoch: number;
  status: SessionStatus;
  working_dir: string;
}

export interface SystemStats {
  cpu_usage: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  child_memory_mb: number;
  child_count: number;
}

// --- Model / Interface types ---

export type CodingInterface = "claude" | "codex";

export type ReasoningLevel = "low" | "medium" | "high" | "extra_high";

export interface ModelOption {
  id: string;
  label: string;
  interface: CodingInterface;
}

export interface ModelGroup {
  interface: CodingInterface;
  label: string;
  models: ModelOption[];
}
