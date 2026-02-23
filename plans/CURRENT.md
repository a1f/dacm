# CURRENT PHASE: Phase 1 — Rename Refactor (Task→Project, Project→Workspace)

> **Full design doc:** `plans/PLAN_FEATURE.md`
> **Feature:** Plan Mode for DACM — plan-driven development with structured phases, steps, exit criteria, and shared context across Claude sessions.

## Why This Rename

The current entity names don't match the product vision. "Project" (a folder path) should be "Workspace", and "Task" (a Claude session container) should be "Project" (a feature initiative). This rename is the foundation for adding Plans under Projects.

**After rename:**
- **Workspace** = a folder/repo path (was "Project")
- **Project** = a unit of work with a Claude session (was "Task")
- **Plan** = structured execution roadmap under a Project (new, Phase 2)

---

## Execution Table

```
  Phase 1: Rename Refactor (Task→Project, Project→Workspace)

  Risk: LOW | Depends on: nothing
  ┌──────┬─────────────────────────────────────────────┬─────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #   │ Step                                        │ Status  │ Details                                                                                          │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.1  │ Create rename migration                     │ Done    │ core/migrations/00000000000003_rename_entities/ — up.sql + down.sql                               │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.2  │ Run migration, regenerate schema.rs         │ Done    │ cd core && diesel migration run                                                                   │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.3  │ Rename Rust models                          │ Done    │ models.rs: Project→Workspace. Rename task_models.rs→project_models.rs: Task→Project              │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.4  │ Rename Rust commands                        │ Done    │ commands.rs→workspace_commands.rs, task_commands.rs→project_commands.rs. All function renames      │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.5  │ Rename session fields                       │ Done    │ session.rs + session_commands.rs: task_id→project_id, project_id→workspace_id                     │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.6  │ Update main.rs registrations                │ Done    │ mod declarations + generate_handler! macro                                                        │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.7  │ Rename TypeScript types                     │ Done    │ types.ts: Project→Workspace, Task→Project, TaskStatus→ProjectStatus, SessionInfo fields           │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.8  │ Rename main.ts state & logic                │ Done    │ State fields, invoke names, callbacks, event listeners throughout                                 │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.9  │ Rename sidebar.ts                           │ Done    │ Callback types, HTML classes, labels ("New task"→"New project")                                   │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.10 │ Rename task-detail.ts → project-detail.ts   │ Done    │ File rename + all type/callback renames                                                           │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.11 │ Rename remaining TS files                   │ Done    │ toolbar.ts, debug-panel.ts, settings-archived.ts                                                 │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.12 │ Rename CSS classes                          │ Done    │ task-row→project-row, project-group→workspace-group, etc.                                        │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.13 │ Update CLAUDE.md                            │ Done    │ Reflect new entity names throughout documentation                                                │
  ├──────┼─────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1.14 │ Verify: compile + run                       │ Done    │ diesel migration run + cargo check + npx tsc --noEmit pass. cargo tauri dev pending smoke test    │
  └──────┴─────────────────────────────────────────────┴─────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘

  Exit: App compiles, starts, existing data migrates. Sidebar shows workspaces with projects.
```

---

## Step Details

### 1.1 Create rename migration

Create `core/migrations/00000000000003_rename_entities/up.sql`:
```sql
ALTER TABLE projects RENAME TO workspaces;
ALTER TABLE tasks RENAME TO projects;
ALTER TABLE projects RENAME COLUMN project_id TO workspace_id;
UPDATE settings SET value = REPLACE(value, '{task_name}', '{project_name}')
  WHERE key = 'worktree_branch_pattern';
UPDATE settings SET key = 'last_workspace_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_task_id';
```

Create `core/migrations/00000000000003_rename_entities/down.sql`:
```sql
UPDATE settings SET key = 'last_task_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_workspace_id';
UPDATE settings SET value = REPLACE(value, '{project_name}', '{task_name}')
  WHERE key = 'worktree_branch_pattern';
ALTER TABLE projects RENAME COLUMN workspace_id TO project_id;
ALTER TABLE projects RENAME TO tasks;
ALTER TABLE workspaces RENAME TO projects;
```

### 1.2 Run migration

```bash
cd core && diesel migration run
```

This regenerates `core/src/schema.rs`. The new schema will have:
- `workspaces (id, name, path, created_at)` (was `projects`)
- `projects (id, name, description, summary, task_id, workspace_id, status, ...)` (was `tasks`, column `project_id`→`workspace_id`)
- `joinable!(projects -> workspaces (workspace_id))`

### 1.3 Rename Rust models

**`core/src/models.rs`** — becomes Workspace model:
```
Project → Workspace
NewProject → NewWorkspace
use crate::schema::projects → use crate::schema::workspaces
#[diesel(table_name = projects)] → #[diesel(table_name = workspaces)]
```

**`core/src/task_models.rs`** — rename file to `core/src/project_models.rs`:
```
Task → Project
NewTask → NewProject
TaskStatusChanged → ProjectStatusChanged
use crate::schema::tasks → use crate::schema::projects
#[diesel(table_name = tasks)] → #[diesel(table_name = projects)]
pub project_id: i32 → pub workspace_id: i32  (field rename)
TaskStatusChanged.task_id → ProjectStatusChanged.project_id
```

Keep `task_id: Option<String>` as-is — this is the Claude CLI's internal session ID, not our entity.

### 1.4 Rename Rust commands

**`core/src/commands.rs`** — rename file to `core/src/workspace_commands.rs`:
```
add_project → add_workspace
remove_project → remove_workspace
list_projects → list_workspaces
All schema::projects refs → schema::workspaces
All models::Project refs → models::Workspace
All models::NewProject refs → models::NewWorkspace
```

**`core/src/task_commands.rs`** — rename file to `core/src/project_commands.rs`:
```
create_task → create_project
update_task_status → update_project_status
rename_task → rename_project
archive_task → archive_project
list_tasks_by_project → list_projects_by_workspace
list_all_tasks → list_all_projects
list_archived_tasks → list_archived_projects
delete_task → delete_project
simulate_task → simulate_project
VALID_STATUSES — unchanged
schema::tasks refs → schema::projects
task_models::Task → project_models::Project
task_models::NewTask → project_models::NewProject
task_models::TaskStatusChanged → project_models::ProjectStatusChanged
Event "task-status-changed" → "project-status-changed"
Parameter task_id → project_id (in function signatures)
Parameter project_id → workspace_id (in function signatures)
```

### 1.5 Rename session fields

**`core/src/session.rs`**:
```
SessionHandle.task_id → SessionHandle.project_id
SessionHandle.project_id → SessionHandle.workspace_id
SessionInfo.task_id → SessionInfo.project_id
SessionInfo.project_id → SessionInfo.workspace_id
All internal refs in spawn(), info(), etc.
```

**`core/src/session_commands.rs`**:
```
spawn_session param task_id → project_id
spawn_session param project_id → workspace_id
All internal handle refs match
```

### 1.6 Update main.rs

```
mod commands → mod workspace_commands
mod task_commands → mod project_commands
mod task_models → mod project_models

generate_handler![
  commands::add_project → workspace_commands::add_workspace,
  commands::remove_project → workspace_commands::remove_workspace,
  commands::list_projects → workspace_commands::list_workspaces,
  task_commands::create_task → project_commands::create_project,
  task_commands::update_task_status → project_commands::update_project_status,
  task_commands::rename_task → project_commands::rename_project,
  task_commands::archive_task → project_commands::archive_project,
  task_commands::list_tasks_by_project → project_commands::list_projects_by_workspace,
  task_commands::list_all_tasks → project_commands::list_all_projects,
  task_commands::simulate_task → project_commands::simulate_project,
  task_commands::list_archived_tasks → project_commands::list_archived_projects,
  task_commands::delete_task → project_commands::delete_project,
  ... (session, settings, system commands unchanged)
]
```

### 1.7 Rename TypeScript types

**`view/src/types.ts`**:
```typescript
// Current "Project" → "Workspace"
export interface Project → export interface Workspace

// Current "Task" → "Project"
export type TaskStatus → export type ProjectStatus
export interface Task → export interface Project
  // field: project_id → workspace_id

// Current "TaskStatusChangedEvent" → "ProjectStatusChangedEvent"
export interface TaskStatusChangedEvent → export interface ProjectStatusChangedEvent
  // field: task_id → project_id

// SessionInfo fields:
  // task_id → project_id
  // project_id → workspace_id
```

### 1.8 Rename main.ts

This is the largest frontend file (~893 lines). Key renames in `AppState` and throughout:
```
state.projects → state.workspaces
state.tasks → state.projects
state.selectedTaskId → state.selectedProjectId
state.selectedProjectId → state.selectedWorkspaceId
state.activeSessions key: taskId → projectId
state.sessionUnlisteners key: taskId → projectId

All invoke() call names must match new Rust command names:
  "add_project" → "add_workspace"
  "remove_project" → "remove_workspace"
  "list_projects" → "list_workspaces"
  "create_task" → "create_project"
  "update_task_status" → "update_project_status"
  "rename_task" → "rename_project"
  "archive_task" → "archive_project"
  "list_tasks_by_project" → "list_projects_by_workspace"
  "list_all_tasks" → "list_all_projects"
  "list_archived_tasks" → "list_archived_projects"
  "delete_task" → "delete_project"
  "simulate_task" → "simulate_project"

Event listener: "task-status-changed" → "project-status-changed"
Settings keys: "last_project_id" → "last_workspace_id", "last_task_id" → "last_project_id"

All callback names and function parameters rename accordingly.
```

### 1.9 Rename sidebar.ts

```
SidebarCallbacks:
  onTaskSelect → onProjectSelect
  onNewTaskForProject → onNewProjectForWorkspace
  onArchiveTask → onArchiveProject
  onRenameTask → onRenameProject
  onRemoveProject → onRemoveWorkspace

Types: Project → Workspace, Task → Project
HTML classes: task-row → project-row, task-name → project-name, task-age → project-age, etc.
Labels: "New task" → "New project"
Data attributes: data-task-id → data-project-id
project-group → workspace-group, project-group-header → workspace-group-header
```

### 1.10 Rename task-detail.ts → project-detail.ts

```bash
git mv view/src/task-detail.ts view/src/project-detail.ts
```

```
TaskDetailCallbacks → ProjectDetailCallbacks
renderTaskDetail → renderProjectDetail
destroyTerminalForTask → destroyTerminalForProject
Task type → Project type
All param names: task → project, taskId → projectId
Import in main.ts updated
```

### 1.11 Rename remaining TS files

**`view/src/toolbar.ts`**:
```
ToolbarProps.selectedProject type: Project → Workspace
ToolbarProps.projects: Project[] → Workspace[]  (rename to .workspaces)
onProjectChange → onWorkspaceChange (callback)
invoke("list_projects") → invoke("list_workspaces") if any
```

**`view/src/debug-panel.ts`**:
```
Task → Project type
onGoToTask → onGoToProject
task references in HTML labels
```

**`view/src/settings-archived.ts`**:
```
Task → Project, invoke renames, label "Archived Tasks" → "Archived Projects"
```

### 1.12 Rename CSS classes

**`view/src/style.css`** — all class renames:
```
.task-row → .project-row
.task-row--selected → .project-row--selected
.task-name → .project-name
.task-name-input → .project-name-input
.task-age → .project-age
.task-archive-btn → .project-archive-btn
.task-status → .project-status
.project-group → .workspace-group
.project-group-header → .workspace-group-header
.project-group-name → .workspace-group-name
.project-add-task-btn → .workspace-add-project-btn
.project-tree → .workspace-tree
Any other task-*/project-* prefixed classes
```

### 1.13 Update CLAUDE.md

Update all references to old entity names throughout the project documentation.

### 1.14 Verify

```bash
cd core && diesel migration run    # Migration applies cleanly
cargo check                         # Rust compiles
cd view && npx tsc --noEmit        # TypeScript compiles
cargo tauri dev                     # App starts, data migrates, UI works
```

Manual checks:
- Sidebar shows workspace groups with project items
- Creating a new project spawns a Claude session
- Archiving/deleting projects works
- Settings pages work (archived projects, worktrees)
- Debug panel shows correct labels

---

## Exit Criteria

- [x] `diesel migration run` succeeds
- [x] `cargo check` passes with zero errors
- [x] `npx tsc --noEmit` passes with zero errors
- [ ] `cargo tauri dev` starts the app (manual smoke test pending)
- [ ] Existing data migrates correctly (workspaces and projects appear)
- [ ] Creating a new project spawns a Claude session correctly
- [ ] Archiving a project works
- [x] No references to old names (Task/task) remain in code except `task_id` field (Claude CLI ID)
