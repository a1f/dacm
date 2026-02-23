# Plan Mode for DACM

## Context

DACM currently manages Claude Code sessions as flat "Tasks" under "Projects" (folder paths). The user wants DACM to become a **plan-driven development environment** where feature work starts with a structured plan (phases, steps, exit criteria), and all Claude sessions share that plan context. This eliminates repeatedly explaining the project to new agents and provides clear progress tracking.

The high-level goal: learn to execute plans in parallel using agents with common memory and plan status.

## Decisions Made

| Decision | Choice |
|----------|--------|
| Entity rename | Full: Task→Project, Project→Workspace |
| Hierarchy | Workspace → Project → Plan |
| Plan storage | Hybrid: plans table metadata + JSON content column |
| Plan creation | Claude spawns with structured prompt, outputs JSON |
| Context sharing | Initial prompt injection (plan summary + step) |
| Status updates | Manual click for MVP |
| Exit criteria | Executable commands + text description |
| Worktrees | Adjacent to repo, per-project on creation |
| UI layout | Tab-based: Plan tab / Terminal tab |
| Sidebar | Workspace > Projects (flat list) |
| Plan cardinality | One active per project (+ history) |
| Rename order | Rename first, then add plan features |

---

## Phase 1: Rename Refactor

**Goal:** Rename Task→Project and Project→Workspace throughout the entire codebase.

### 1.1 Create migration `core/migrations/00000000000003_rename_entities/`

`up.sql`:
```sql
ALTER TABLE projects RENAME TO workspaces;
ALTER TABLE tasks RENAME TO projects;
ALTER TABLE projects RENAME COLUMN project_id TO workspace_id;
UPDATE settings SET value = REPLACE(value, '{task_name}', '{project_name}')
  WHERE key = 'worktree_branch_pattern';
UPDATE settings SET key = 'last_workspace_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_task_id';
```

`down.sql`:
```sql
UPDATE settings SET key = 'last_task_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_workspace_id';
UPDATE settings SET value = REPLACE(value, '{project_name}', '{task_name}')
  WHERE key = 'worktree_branch_pattern';
ALTER TABLE projects RENAME COLUMN workspace_id TO project_id;
ALTER TABLE projects RENAME TO tasks;
ALTER TABLE workspaces RENAME TO projects;
```

Run `cd core && diesel migration run` to regenerate `schema.rs`.

### 1.2 Rename Rust models

- `core/src/models.rs` → Project→Workspace, NewProject→NewWorkspace, table_name=workspaces
- `core/src/task_models.rs` → rename file to `project_models.rs`, Task→Project, NewTask→NewProject, field `project_id`→`workspace_id`, table_name=projects
- Keep `task_id` field as-is (it's the Claude CLI's internal ID)

### 1.3 Rename Rust commands

- `core/src/commands.rs` → rename file to `workspace_commands.rs`
  - add_project→add_workspace, remove_project→remove_workspace, list_projects→list_workspaces
- `core/src/task_commands.rs` → rename file to `project_commands.rs`
  - create_task→create_project, update_task_status→update_project_status, rename_task→rename_project, archive_task→archive_project, list_tasks_by_project→list_projects_by_workspace, list_all_tasks→list_all_projects, list_archived_tasks→list_archived_projects, delete_task→delete_project, simulate_task→simulate_project
  - Event: `task-status-changed` → `project-status-changed`

### 1.4 Rename session fields

- `core/src/session.rs` — SessionHandle/SessionInfo: task_id→project_id, project_id→workspace_id
- `core/src/session_commands.rs` — spawn_session params match

### 1.5 Update `core/src/main.rs`

- mod declarations, generate_handler! macro — all new names

### 1.6 Rename TypeScript frontend

- `view/src/types.ts` — Project→Workspace, Task→Project, TaskStatus→ProjectStatus, SessionInfo fields
- `view/src/main.ts` — state fields, invoke names, callbacks, event listeners
- `view/src/sidebar.ts` — callback types, HTML classes, labels ("New task"→"New project")
- `view/src/task-detail.ts` → rename to `project-detail.ts`, all type/callback renames
- `view/src/toolbar.ts` — Project→Workspace in props
- `view/src/debug-panel.ts` — Task→Project
- `view/src/settings-archived.ts` — type renames, invoke renames

### 1.7 Rename CSS classes

- `view/src/style.css` — task-row→project-row, project-group→workspace-group, etc.

### 1.8 Update CLAUDE.md

**Verify:** `diesel migration run` + `cargo check` + `npx tsc --noEmit` + `cargo tauri dev` — app starts, existing data migrates, sidebar shows workspaces/projects correctly.

---

## Phase 2: Plan Data Model

**Goal:** Add plans table and Rust/TS types for structured plan storage.

### 2.1 Create migration `core/migrations/00000000000004_create_plans/`

```sql
CREATE TABLE plans (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    content TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plans_project_id ON plans(project_id);
```

Plan statuses: `draft`, `active`, `completed`, `archived`

### 2.2 Create `core/src/plan_models.rs`

- `Plan` struct (Queryable) — id, project_id, name, status, content (JSON string), timestamps
- `NewPlan` struct (Insertable)
- `PlanContent` struct (Serialize/Deserialize) — goal, constraints, phases[]
- `PlanPhase` — id, name, risk, estimated_duration, exit_criteria {commands[], description}, steps[]
- `PlanStep` — id, name, status (pending/in_progress/completed/blocked/skipped), details, files[]

### 2.3 Create `core/src/plan_commands.rs`

Commands:
- `create_plan(project_id, name, content_json)` → Plan
- `get_active_plan(project_id)` → Option<Plan>
- `list_plans_by_project(project_id)` → Vec<Plan>
- `update_plan_content(plan_id, content_json)` → Plan (validates JSON via serde)
- `update_plan_status(plan_id, status)` → Plan
- `update_step_status(plan_id, step_id, new_status)` → Plan (deserialize → find step → update → save)
- `delete_plan(plan_id)` → ()

### 2.4 Register in `main.rs`, add TS types in `types.ts`

**Verify:** `diesel migration run` + `cargo check` + `npx tsc --noEmit`

---

## Phase 3: Plan Viewer UI

**Goal:** Tab system in project detail + plan execution table with manual status toggling.

### 3.1 Add tab system to `project-detail.ts`

Two tabs at top of main content: **Terminal** | **Plan**
- Terminal tab: existing terminal view (unchanged)
- Plan tab: plan viewer component
- Tab state persisted per-project in module-level Map

### 3.2 Create `view/src/plan-viewer.ts`

**Empty state:** "No plan yet" + "+ Create Plan" button

**Plan view (execution table):**
```
Plan: "Architecture Redesign"  [Active]

Phase 0: Contract Freeze + Dead Code Removal
Risk: LOW | ~2-3 days
Exit: cargo test && diff openapi.json

 # │ Step                          │ Status      │ Details
0.1│ Generate OpenAPI snapshot     │ ● Pending   │ python -c "..."
0.2│ Add key integration tests     │ ◐ In Progress│ login → start → log...
0.3│ Delete ClientExcerciseStatsORM│ ✓ Completed │ ORM + Alembic migration
```

- Step status indicators are clickable (cycle: pending → in_progress → completed)
- Right-click or long-press for blocked/skipped
- Phase headers are collapsible
- Progress counters per phase (3/5 steps)

### 3.3 Add CSS for plan viewer + tabs

- `.detail-tabs`, `.detail-tab`, `.detail-tab--active`
- `.plan-viewer`, `.plan-phase`, `.plan-phase-header`, `.plan-step-row`
- `.step-status--pending/in_progress/completed/blocked/skipped`

### 3.4 Wire up in `main.ts`

- Add `activePlans: Map<number, Plan>` to state
- Fetch active plan on project select: `invoke("get_active_plan", {projectId})`
- Step status clicks call `invoke("update_step_status", {planId, stepId, status})`

**Verify:** App starts, tabs appear, Plan tab shows empty state, manually created plans render correctly, step status toggling persists.

---

## Phase 4: Claude Plan Creation

**Goal:** "+Create Plan" spawns a Claude session that outputs structured JSON, user approves, plan saves.

### 4.1 Add terminal output accumulator

In `terminal.ts`: add a `rawOutputBuffers: Map<sessionId, string>` that accumulates decoded text from `session-output` events. Export `getTerminalOutput(sessionId): string`.

### 4.2 Plan creation prompt

When user clicks "+ Create Plan", spawn a Claude session with this initial prompt:

```
You are a software architect. The user will describe what they want to build.
After discussing, output the final plan as a JSON code block with this schema:
{
  "goal": "string",
  "constraints": ["string"],
  "phases": [{
    "id": "0", "name": "...", "risk": "low|medium|high",
    "estimated_duration": "...",
    "exit_criteria": {"commands": ["..."], "description": "..."},
    "steps": [{"id": "0.1", "name": "...", "status": "pending", "details": "...", "files": ["..."]}]
  }]
}
Output ONLY the JSON in a ```json code block when the plan is complete.
```

### 4.3 Plan save flow

- "Save Plan" button appears in the Plan tab while a session is active
- On click: extract last ` ```json...``` ` block from terminal output buffer
- Strip ANSI escape codes, parse JSON, validate against PlanContent schema
- Show preview to user, on confirm: `invoke("create_plan", {...})`
- Switch plan status to "active"

**Verify:** Click "Create Plan", Claude outputs JSON, "Save Plan" extracts and persists it, plan renders in viewer.

---

## Phase 5: Context Injection

**Goal:** When spawning Claude sessions, inject the plan summary so agents know the plan and current progress.

### 5.1 Plan summary generator

In `plan-viewer.ts`, add `generatePlanContext(plan: PlanContent): string` that outputs:

```
# Active Plan: "Goal here"
## Progress: Phase 1 (3/5 steps done)
## Current Step: 1.4 - JWT validation
### Details: Add middleware that validates JWT tokens...
### Completed: 1.1 (migration), 1.2 (user model), 1.3 (hashing)
### Remaining: 1.4 (JWT validation), 1.5 (login endpoint)
### Exit Criteria: pytest tests/ passes, all endpoints return 401 without token
```

### 5.2 Inject into session spawn

In `main.ts` `spawnSessionForProject()`:
- Fetch active plan
- If exists, prepend `generatePlanContext(plan)` to `initialPrompt`
- Claude session starts with full plan awareness

**Verify:** Create plan, mark some steps complete, start new session — Claude receives plan context with correct progress.

---

## Phase 6: Worktree Support

**Goal:** Create git worktrees adjacent to repo when creating projects. Clean up on archive/delete.

### 6.1 Add `create_worktree` Tauri command

Params: project_id, workspace_path, worktree_path, branch_name.
- Run `git worktree add {path} -b {branch}` via `std::process::Command`
- Update project record with worktree_path and branch_name

### 6.2 Add `remove_worktree` Tauri command

- Run `git worktree remove {path}` in workspace dir
- Clear worktree_path/branch_name on project record

### 6.3 Integration

- On project creation: if workspace is a git repo, create worktree at `{base_path}/{workspace_name}-worktrees/{project_slug}/`
- Session spawn uses `project.worktree_path || workspace.path` as working dir
- On project archive/delete: remove worktree

### 6.4 Update settings-worktrees.ts for new naming

**Verify:** Configure worktree base path, create project → worktree appears, sessions open in worktree, archive → worktree cleaned up.

---

## Dependency Graph

```
Phase 1 (Rename) ──┬──→ Phase 2 (Data Model) → Phase 3 (UI) → Phase 4 (Claude Creation) → Phase 5 (Context)
                    └──→ Phase 6 (Worktrees) [parallel with 2-5]
```

## Key Files

| File | Phases | Notes |
|------|--------|-------|
| `core/src/main.rs` | 1, 2 | Command registration hub |
| `core/src/task_commands.rs` → `project_commands.rs` | 1 | Largest rename, pattern for plan_commands |
| `core/src/session.rs` | 1, 5 | Field renames + future context injection |
| `view/src/main.ts` | 1, 3, 4, 5 | Central orchestration, every phase touches it |
| `view/src/task-detail.ts` → `project-detail.ts` | 1, 3 | Rename + tab system |
| `view/src/types.ts` | 1, 2 | All type definitions must match Rust models |
| `view/src/terminal.ts` | 4 | Output accumulator for plan parsing |
| NEW `core/src/plan_models.rs` | 2 | Plan + PlanContent structs |
| NEW `core/src/plan_commands.rs` | 2, 4 | Plan CRUD + step status updates |
| NEW `view/src/plan-viewer.ts` | 3, 4, 5 | Execution table + save flow + context gen |

---

## Execution Table

### Phase 1: Rename Refactor (Task→Project, Project→Workspace)

Risk: LOW | Depends on: nothing

| # | Step | Status | Details |
|---|------|--------|---------|
| 1.1 | Create rename migration | Pending | `core/migrations/00000000000003_rename_entities/` — ALTER TABLE projects→workspaces, tasks→projects, rename column project_id→workspace_id |
| 1.2 | Run migration, regenerate schema.rs | Pending | `cd core && diesel migration run` |
| 1.3 | Rename Rust models | Pending | `models.rs`: Project→Workspace. Rename `task_models.rs`→`project_models.rs`: Task→Project, project_id→workspace_id |
| 1.4 | Rename Rust commands | Pending | Rename `commands.rs`→`workspace_commands.rs`, `task_commands.rs`→`project_commands.rs`. All function/param renames |
| 1.5 | Rename session fields | Pending | `session.rs` + `session_commands.rs`: task_id→project_id, project_id→workspace_id |
| 1.6 | Update main.rs registrations | Pending | mod declarations + generate_handler! macro |
| 1.7 | Rename TypeScript types | Pending | `types.ts`: Project→Workspace, Task→Project, TaskStatus→ProjectStatus, SessionInfo fields |
| 1.8 | Rename main.ts state & logic | Pending | State fields, invoke names, callbacks, event listeners throughout |
| 1.9 | Rename sidebar.ts | Pending | Callback types, HTML classes, labels ("New task"→"New project") |
| 1.10 | Rename task-detail.ts → project-detail.ts | Pending | File rename + all type/callback renames |
| 1.11 | Rename remaining TS files | Pending | toolbar.ts, debug-panel.ts, settings-archived.ts |
| 1.12 | Rename CSS classes | Pending | task-row→project-row, project-group→workspace-group, etc. |
| 1.13 | Update CLAUDE.md | Pending | Reflect new entity names throughout documentation |
| 1.14 | Verify: compile + run | Pending | `diesel migration run` + `cargo check` + `npx tsc --noEmit` + `cargo tauri dev` |

Exit criteria: App compiles, starts, existing data migrates. Sidebar shows workspaces with projects.

---

### Phase 2: Plan Data Model

Risk: LOW | Depends on: Phase 1

| # | Step | Status | Details |
|---|------|--------|---------|
| 2.1 | Create plans migration | Pending | `core/migrations/00000000000004_create_plans/` — plans table with id, project_id, name, status, content JSON, timestamps |
| 2.2 | Run migration, regenerate schema.rs | Pending | `cd core && diesel migration run` |
| 2.3 | Create plan_models.rs | Pending | Plan (Queryable), NewPlan (Insertable), PlanContent/PlanPhase/PlanStep (Serialize/Deserialize) |
| 2.4 | Create plan_commands.rs | Pending | create_plan, get_active_plan, list_plans_by_project, update_plan_content, update_plan_status, update_step_status, delete_plan |
| 2.5 | Register commands in main.rs | Pending | Add mod + generate_handler entries |
| 2.6 | Add TypeScript plan types | Pending | Plan, PlanContent, PlanPhase, PlanStep, StepStatus, PlanStatus in types.ts |
| 2.7 | Verify: compile | Pending | `cargo check` + `npx tsc --noEmit` |

Exit criteria: `cargo check` passes. Plan CRUD commands callable from frontend.

---

### Phase 3: Plan Viewer UI

Risk: MEDIUM | Depends on: Phase 2

| # | Step | Status | Details |
|---|------|--------|---------|
| 3.1 | Add tab system to project-detail.ts | Pending | Terminal / Plan tabs at top of main content, persisted tab state per-project |
| 3.2 | Create plan-viewer.ts — empty state | Pending | "No plan yet" + "+ Create Plan" button |
| 3.3 | Create plan-viewer.ts — execution table | Pending | Phase headers (collapsible) with step rows showing #, name, status indicator, details |
| 3.4 | Add step status toggling | Pending | Click to cycle pending→in_progress→completed. Right-click for blocked/skipped |
| 3.5 | Add plan viewer CSS | Pending | Tabs, phase headers, step rows, status indicators with colors |
| 3.6 | Wire up in main.ts | Pending | activePlans state, fetch on project select, step status change invocations |
| 3.7 | Verify: UI works | Pending | Tabs switch, plan renders, status toggling persists |

Exit criteria: Plan tab shows execution table. Step status changes persist across tab switches and app restart.

---

### Phase 4: Claude Plan Creation

Risk: MEDIUM | Depends on: Phase 3

| # | Step | Status | Details |
|---|------|--------|---------|
| 4.1 | Add terminal output accumulator | Pending | `terminal.ts`: rawOutputBuffers Map, getTerminalOutput() export |
| 4.2 | Implement plan creation prompt | Pending | "+Create Plan" spawns Claude with structured JSON schema prompt |
| 4.3 | Implement plan save flow | Pending | "Save Plan" button extracts last ```json block, strips ANSI, validates, saves |
| 4.4 | Add plan preview before save | Pending | Show parsed plan summary for user confirmation before persisting |
| 4.5 | Verify: full creation loop | Pending | Create Plan → Claude outputs JSON → Save → plan renders in viewer |

Exit criteria: User can create a plan via Claude and see it in the execution table.

---

### Phase 5: Context Injection

Risk: LOW | Depends on: Phase 4

| # | Step | Status | Details |
|---|------|--------|---------|
| 5.1 | Build plan summary generator | Pending | `generatePlanContext()`: goal, progress, current step, completed/remaining, exit criteria |
| 5.2 | Inject into session spawn | Pending | Prepend plan context to initialPrompt in main.ts spawnSessionForProject() |
| 5.3 | Verify: context received | Pending | Start session with active plan, confirm Claude knows the plan and progress |

Exit criteria: New Claude sessions receive plan context with accurate progress.

---

### Phase 6: Worktree Support

Risk: LOW-MEDIUM | Depends on: Phase 1 (parallel with 2-5)

| # | Step | Status | Details |
|---|------|--------|---------|
| 6.1 | Add create_worktree command | Pending | Rust: `git worktree add {path} -b {branch}` via std::process::Command, update project record |
| 6.2 | Add remove_worktree command | Pending | Rust: `git worktree remove {path}`, clear project fields |
| 6.3 | Integrate with project creation | Pending | If workspace is git repo, auto-create worktree at `{base}/{workspace}-worktrees/{project_slug}/` |
| 6.4 | Integrate with session spawn | Pending | Use `project.worktree_path || workspace.path` as working dir |
| 6.5 | Integrate with archive/delete | Pending | Remove worktree on project cleanup |
| 6.6 | Update worktree settings UI | Pending | Reflect new naming in settings-worktrees.ts |
| 6.7 | Verify: worktree lifecycle | Pending | Create project → worktree exists → session uses it → archive → worktree gone |

Exit criteria: Worktrees created/cleaned automatically. Sessions open in correct directory.
