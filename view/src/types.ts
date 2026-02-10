export interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
}

export type TaskStatus = "running" | "waiting" | "completed" | "archived";

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

export interface SessionInfo {
  session_id: string;
  task_id: number;
  project_id: number;
  pid: number | null;
  uptime_secs: number;
  status: SessionStatus;
  working_dir: string;
}
