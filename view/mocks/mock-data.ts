import type { Project, Task } from "../src/types.ts";

// Helper to create ISO date strings relative to now
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const mockProjects: Project[] = [
  { id: 1, name: "web-app", path: "/home/user/projects/web-app", created_at: "2025-01-15T10:00:00" },
  { id: 2, name: "api-server", path: "/home/user/projects/api-server", created_at: "2025-01-16T14:30:00" },
  { id: 3, name: "mobile-client", path: "/home/user/projects/mobile-client", created_at: "2025-01-17T09:15:00" },
];

export const mockTasks: Task[] = [
  {
    id: 1,
    name: "Add authentication flow",
    description: "Implement OAuth2 login with Google and GitHub providers",
    summary: "",
    task_id: null,
    project_id: 1,
    status: "running",
    start_time: daysAgo(1),
    iteration_count: 3,
    worktree_path: "/home/user/projects/web-app/.worktrees/auth",
    branch_name: "feature/auth-flow",
    created_at: daysAgo(1),
  },
  {
    id: 2,
    name: "Fix pagination bug",
    description: "Users report page 2 shows same results as page 1",
    summary: "",
    task_id: null,
    project_id: 1,
    status: "waiting",
    start_time: null,
    iteration_count: 0,
    worktree_path: null,
    branch_name: null,
    created_at: daysAgo(3),
  },
  {
    id: 3,
    name: "Database migration to v2",
    description: "Migrate from PostgreSQL 14 to 16 with new schema changes",
    summary: "",
    task_id: null,
    project_id: 2,
    status: "completed",
    start_time: daysAgo(14),
    iteration_count: 1,
    worktree_path: null,
    branch_name: "chore/db-migration",
    created_at: daysAgo(14),
  },
  {
    id: 4,
    name: "Add rate limiting",
    description: "Implement request rate limiting middleware for all endpoints",
    summary: "",
    task_id: null,
    project_id: 2,
    status: "running",
    start_time: daysAgo(7),
    iteration_count: 5,
    worktree_path: "/home/user/projects/api-server/.worktrees/rate-limit",
    branch_name: "feature/rate-limiting",
    created_at: daysAgo(7),
  },
  {
    id: 5,
    name: "Setup CI pipeline",
    description: "Configure GitHub Actions for build, test, and deploy",
    summary: "",
    task_id: null,
    project_id: 3,
    status: "waiting",
    start_time: null,
    iteration_count: 0,
    worktree_path: null,
    branch_name: null,
    created_at: daysAgo(30),
  },
  {
    id: 6,
    name: "Refactor legacy auth module",
    description: "Replace the old session-based auth with the new JWT system",
    summary: "Completed migration from sessions to JWT tokens",
    task_id: null,
    project_id: 1,
    status: "archived",
    start_time: daysAgo(45),
    iteration_count: 2,
    worktree_path: null,
    branch_name: "chore/legacy-auth-cleanup",
    created_at: daysAgo(45),
  },
];

export interface MockSetting {
  key: string;
  value: string;
}

export const mockSettings: MockSetting[] = [
  { key: "theme", value: "system" },
  { key: "prevent_sleep", value: "false" },
  { key: "code_font_family", value: '"SF Mono", "Fira Code", monospace' },
  { key: "code_font_size", value: "13" },
  { key: "terminal_font_family", value: '"SF Mono", "Fira Code", "Menlo", monospace' },
  { key: "terminal_font_size", value: "13" },
  { key: "worktree_base_path", value: "" },
  { key: "worktree_branch_pattern", value: "feature/{task_name}" },
];
