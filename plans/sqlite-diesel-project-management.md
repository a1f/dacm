# DACM: SQLite Database Layer with Diesel ORM

## Problem & Goals

Add persistent project management to DACM. Users need to register local project directories, see them listed, and remove them. This requires a SQLite database, Rust ORM layer, Tauri commands, and frontend UI.

## Decisions

- **ORM**: Diesel 2 (compile-time query checking, embedded migrations)
- **DB Location**: Tauri `app_data_dir` (`~/Library/Application Support/com.dacm.desktop/dacm.db`)
- **Frontend**: Vanilla TypeScript (no framework)
- **Folder Picker**: `tauri-plugin-dialog` native Finder dialog

## Schema

```sql
CREATE TABLE projects (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Target File Structure

```
core/
  Cargo.toml             # MODIFY - add diesel, diesel_migrations, tauri-plugin-dialog, libsqlite3-sys
  diesel.toml            # CREATE - diesel CLI config
  src/
    main.rs              # MODIFY - setup hook, state, commands
    db.rs                # CREATE - connection init, migration runner, DbState
    models.rs            # CREATE - Project (Queryable), NewProject (Insertable)
    schema.rs            # CREATE - diesel table! macro (hand-written, matches migration)
    commands.rs          # CREATE - add_project, remove_project, list_projects
  migrations/
    00000000000000_create_projects/
      up.sql             # CREATE
      down.sql           # CREATE
  capabilities/
    default.json         # MODIFY - add dialog:default, dialog:allow-open
view/
  package.json           # MODIFY - add @tauri-apps/plugin-dialog
  src/
    main.ts              # MODIFY - project management UI
    style.css            # MODIFY - project list styles
```

---

## Execution Plan

### Step 0: Install diesel_cli (dev prerequisite)

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - `cargo install diesel_cli --no-default-features --features sqlite`
- **Validation**: `diesel --version`
- **Exit Criteria**: diesel_cli installed and available on PATH
- **Rollback**: `cargo uninstall diesel_cli`

### Step 1: Add Rust dependencies

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Add to `core/Cargo.toml` dependencies:
    - `tauri-plugin-dialog = "2"`
    - `diesel = { version = "2", features = ["sqlite", "chrono"] }`
    - `diesel_migrations = "2"`
    - `libsqlite3-sys = { version = "0.30", features = ["bundled"] }`
- **Validation**: `cargo check -p dacm-core`
- **Exit Criteria**: Compiles with no errors
- **Rollback**: `git checkout -- core/Cargo.toml`

### Step 2: Create Diesel config, migrations, schema

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Create `core/diesel.toml` pointing schema to `src/schema.rs` and migrations to `migrations/`
  - Create `core/migrations/00000000000000_create_projects/up.sql` (CREATE TABLE)
  - Create `core/migrations/00000000000000_create_projects/down.sql` (DROP TABLE)
  - Create `core/src/schema.rs` with `diesel::table!` macro matching the migration
- **Validation**: `cargo check -p dacm-core`
- **Exit Criteria**: Schema compiles, migration SQL is valid
- **Rollback**: Delete diesel.toml, migrations/, src/schema.rs

### Step 3: Create models module

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Create `core/src/models.rs`:
    - `Project` struct: `Queryable, Selectable, Serialize` (id, name, path, created_at as NaiveDateTime)
    - `NewProject` struct: `Insertable` (name, path only — id and created_at auto-generated)
- **Validation**: `cargo check -p dacm-core` (after adding `mod models;` to main.rs)
- **Exit Criteria**: Structs compile with correct Diesel derives
- **Rollback**: Delete src/models.rs

### Step 4: Create database module

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Create `core/src/db.rs`:
    - `MIGRATIONS` const via `embed_migrations!("migrations")`
    - `DbState` struct wrapping `Mutex<SqliteConnection>`
    - `init_db(app_data_dir: &Path)` — creates dir, establishes connection, runs pending migrations
- **Validation**: `cargo check -p dacm-core`
- **Exit Criteria**: DB module compiles, migrations embedded
- **Rollback**: Delete src/db.rs

### Step 5: Create commands module

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Create `core/src/commands.rs`:
    - `add_project(state, path)` — derives name from path's last component, inserts, returns Project
    - `remove_project(state, id)` — deletes by id, errors if not found
    - `list_projects(state)` — returns all projects ordered by created_at desc
  - All use `State<'_, DbState>` for DB access
- **Validation**: `cargo check -p dacm-core`
- **Exit Criteria**: All three commands compile with correct signatures
- **Rollback**: Delete src/commands.rs

### Step 6: Rewrite main.rs

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Declare modules: `mod commands; mod db; mod models; mod schema;`
  - Register dialog plugin: `.plugin(tauri_plugin_dialog::init())`
  - Setup hook: resolve app_data_dir, call `db::init_db`, `app.manage(db_state)`
  - Register commands: `generate_handler![commands::add_project, commands::remove_project, commands::list_projects]`
  - Remove old `log_button_press` command (was scaffolding)
- **Validation**: `cargo build -p dacm-core`
- **Exit Criteria**: Full Rust backend compiles and links
- **Rollback**: `git checkout -- core/src/main.rs`

### Step 7: Configure Tauri capabilities

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Add to `core/capabilities/default.json` permissions: `"dialog:default"`, `"dialog:allow-open"`
- **Validation**: `cargo build -p dacm-core` (Tauri validates capabilities at build time)
- **Exit Criteria**: Build succeeds with dialog permissions
- **Rollback**: `git checkout -- core/capabilities/default.json`

### Step 8: Add frontend dialog dependency

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - `cd view && npm install @tauri-apps/plugin-dialog`
- **Validation**: `npm ls @tauri-apps/plugin-dialog`
- **Exit Criteria**: Package installed
- **Rollback**: `npm uninstall @tauri-apps/plugin-dialog`

### Step 9: Rewrite frontend

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - Rewrite `view/src/main.ts`:
    - Project interface (id, name, path, created_at)
    - `loadProjects()` — invoke list_projects, render list
    - `addProject()` — open({ directory: true }), invoke add_project with selected path
    - `removeProject(id)` — invoke remove_project
    - HTML: toolbar with "Add Project Folder" button, project list container, status line
    - Event delegation for delete buttons
    - XSS-safe rendering with escapeHtml
  - Update `view/src/style.css`:
    - .project-row (flex, border, spacing)
    - .project-name (bold), .project-path (small, gray, ellipsis overflow)
    - .delete-btn (red outline, hover fill)
    - .empty, .error states
- **Validation**: `cd view && npx tsc --noEmit`
- **Exit Criteria**: TypeScript compiles, UI renders correctly
- **Rollback**: `git checkout -- view/src/main.ts view/src/style.css`

### Step 10: End-to-end validation

- **Status**: pending | **Attempts**: 0/4
- **Actions**:
  - `cargo tauri dev` — launch app
  - Manual test: add project via folder picker, verify list renders, remove project, restart app (persistence check)
  - Verify DB file at `~/Library/Application Support/com.dacm.desktop/dacm.db`
- **Validation**: All manual tests pass
- **Exit Criteria**: Add, list, remove, and persistence all work
- **Rollback**: N/A (testing step)

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `Mutex<SqliteConnection>` not async pool | Diesel is sync; SQLite is single-writer; Mutex is correct and simple |
| `libsqlite3-sys` bundled | Avoids needing system SQLite headers; works on CI/CD |
| `embed_migrations!()` | Migrations compiled into binary; no diesel_cli needed at runtime |
| Name derived from path | `std::path::Path::file_name()` extracts folder name; no extra user input needed |
| `path` UNIQUE constraint | Prevents duplicate project entries at DB level |
| Event delegation for delete | Avoids re-attaching listeners on re-render |
| No confirmation dialog on delete | Keeps scope minimal; can add later |

## Out of Scope

- Async DB pool (unnecessary for SQLite + Diesel)
- User-editable project name (auto-derived from folder)
- Project detail view (just list for now)
- Delete confirmation dialog
- Unit tests (follow-up task)

## Status Log

| Date | Event |
|------|-------|
| 2026-02-03 | Plan created |
