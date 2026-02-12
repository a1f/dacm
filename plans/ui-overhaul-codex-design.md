# DACM UI Overhaul: Codex-style Design + Settings System

## Context

DACM's current UI is a functional MVP with a dark-only theme, a header-based sidebar with hamburger menu, and a basic task detail/new-task form. The goal is to transform it into a polished Codex-like experience: tree-view sidebar with project groups, settings system with persistence, light/dark/system theming, a "Let's build" start page with one-click task+session creation, and a collapsible sidebar. Playwright testing (with mocked Tauri backend) will be established first so every subsequent change is validated.

## Critical Files

| File | Role |
|------|------|
| `view/src/style.css` | All CSS (~600 lines), dark-only theme with CSS vars |
| `view/src/main.ts` | AppState, render loop, Tauri IPC, event listeners |
| `view/src/sidebar.ts` | Sidebar rendering: header, hamburger, project groups, task rows |
| `view/src/task-detail.ts` | 3 modes: empty (new task form), static detail, terminal mode |
| `view/src/terminal.ts` | xterm.js wrapper, hardcoded dark theme + font |
| `view/src/types.ts` | Project, Task, SessionInfo, TaskStatus interfaces |
| `view/mocks/mock-data.ts` | 3 projects, 5 tasks (no archived, no settings) |
| `core/src/main.rs` | 16 registered commands, app lifecycle |
| `core/src/task_commands.rs` | Task CRUD (filters out archived in list_all_tasks) |
| `core/src/schema.rs` | Auto-generated: projects + tasks tables |
| `core/tauri.conf.json` | Window: 1280x860, title "DACM", default title bar |

---

## Phase 0: Playwright Testing Infrastructure

**Goal:** UI tests that work without the Rust backend by mocking `@tauri-apps/api`.

### Step 0.1: Install Playwright + configure test runner
- **Add** `@playwright/test` to `view/package.json` devDependencies
- **Create** `view/playwright.config.ts`: webServer on port 1420, test dir `view/tests/`, chromium only
- **Add** npm scripts: `"test": "playwright test"`, `"test:ui": "playwright test --ui"`
- **Validate:** `cd view && npx playwright test --list` finds 0 tests, no config errors

### Step 0.2: Create Tauri API mock layer
- **Create** `view/tests/mocks/tauri-mock.ts`
- Intercepts `window.__TAURI_INTERNALS__.invoke` via `page.addInitScript()`
- Maps command names to mock responses using data from `view/mocks/mock-data.ts`
- Mock commands: `list_projects`, `list_all_tasks`, `list_sessions` (empty), `create_task`, `update_task_status`, `archive_task`, `add_project`, `remove_project`, `spawn_session`, `kill_session`, `write_to_session`, `resize_session`, `start_session_stream`, `list_settings`, `get_setting`, `set_setting`
- **Validate:** Manually confirm `invoke` calls resolve with mock data

### Step 0.3: Create test fixtures + helpers
- **Create** `view/tests/fixtures.ts` -- shared setup: addInitScript injection, page goto
- **Create** `view/tests/helpers.ts` -- DOM query helpers: `getSidebarProjects()`, `getTaskRows()`, `getMainContent()`
- **Validate:** Import in a trivial test without errors

### Step 0.4: Write baseline smoke tests
- **Create** `view/tests/sidebar.spec.ts` -- sidebar renders 3 project groups, task rows show status indicators, task selection works
- **Create** `view/tests/task-detail.spec.ts` -- no task: "New Task" form renders; task selected: static detail with status buttons
- **Create** `view/tests/layout.spec.ts` -- sidebar 280px + main content flex, no JS errors
- **Validate:** `npm test` -- all pass

### Step 0.5: Extend mock data
- **Modify** `view/mocks/mock-data.ts` -- add archived task (id:6, status:"archived"), add `mockSettings` array with default key/value pairs, vary task dates for age label testing
- **Validate:** Mock data compiles, all tests still pass

---

## Phase 1: Settings Backend (SQLite + Diesel + Tauri Commands)

**Goal:** Persist settings in SQLite so the frontend has a storage layer.

### Step 1.1: Diesel migration for settings table
- **Create** `core/migrations/00000000000002_create_settings/up.sql`:
  ```sql
  CREATE TABLE settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO settings (key, value) VALUES
    ('theme', 'system'),
    ('prevent_sleep', 'false'),
    ('code_font_family', '"SF Mono", "Fira Code", monospace'),
    ('code_font_size', '13'),
    ('terminal_font_family', '"SF Mono", "Fira Code", "Menlo", monospace'),
    ('terminal_font_size', '13'),
    ('worktree_base_path', ''),
    ('worktree_branch_pattern', 'feature/{task_name}');
  ```
- **Create** `down.sql`: `DROP TABLE settings;`
- **Run** `cd core && diesel migration run` -- schema.rs regenerated
- **Validate:** `cargo check` compiles

### Step 1.2: Rust settings model + commands
- **Create** `core/src/settings_models.rs` -- `Setting` (Queryable, Serialize: key, value), `NewSetting` (Insertable, AsChangeset)
- **Create** `core/src/settings_commands.rs` -- 3 commands:
  - `get_setting(key) -> String`
  - `set_setting(key, value) -> ()`  (INSERT OR REPLACE)
  - `list_settings() -> Vec<Setting>`
- **Modify** `core/src/main.rs` -- add `mod settings_models; mod settings_commands;`, register all 3 in invoke_handler
- **Validate:** `cargo check` compiles

### Step 1.3: Frontend settings API
- **Modify** `view/src/types.ts` -- add `Setting { key: string; value: string }`, `ThemeMode = 'light' | 'dark' | 'system'`
- **Create** `view/src/settings-api.ts` -- thin `invoke()` wrappers: `getSetting()`, `setSetting()`, `listSettings()`
- **Validate:** `npx tsc --noEmit`

### Step 1.4: Playwright tests for settings mock
- **Update** `view/tests/mocks/tauri-mock.ts` with settings command handlers
- **Create** `view/tests/settings-api.spec.ts` -- mock returns correct defaults
- **Validate:** `npm test` -- all pass

---

## Phase 2: Theme System (Light / Dark / System)

**Goal:** CSS variable-based dual theme with system detection and xterm.js integration.

### Step 2.1: Refactor CSS to dual-theme variables
- **Modify** `view/src/style.css` -- replace `:root` with:
  - Shared tokens (accent colors, sidebar-width)
  - `:root, [data-theme="dark"]` block: dark palette (VSCode-like: `#1e1e1e`, `#252526`, `#2d2d30`)
  - `[data-theme="light"]` block: light palette (`#ffffff`, `#f3f3f3`, `#e8e8e8`)
  - Replace all hardcoded colors with variables throughout the file (~40 replacements)
- **Validate:** App looks identical with dark theme. Manually set `data-theme="light"` on `<html>` in devtools -- entire UI switches to light

### Step 2.2: Create theme manager
- **Create** `view/src/theme.ts`:
  - `initTheme(mode: ThemeMode)` -- applies theme, sets up system listener if mode='system'
  - `setTheme(mode: ThemeMode)` -- updates `data-theme` on `<html>`, persists via `setSetting`
  - `getEffectiveTheme(): 'light' | 'dark'` -- resolves 'system' to actual
  - `getTerminalTheme(): ITheme` -- returns xterm theme object for current effective theme
  - Dispatches `dacm-theme-changed` custom event on change
- **Validate:** `setTheme('light')` from console switches UI

### Step 2.3: Integrate theme with app + terminal
- **Modify** `view/src/main.ts` -- call `initTheme()` with stored setting during startup (before first render)
- **Modify** `view/src/terminal.ts` -- use `getTerminalTheme()` when creating Terminal instances; listen for `dacm-theme-changed` and update `terminal.options.theme` on all cached terminals
- **Validate:** Theme persists across reload. System theme change triggers update when set to 'system'

### Step 2.4: Playwright tests for theme
- **Create** `view/tests/theme.spec.ts` -- dark default has dark bg, light has white bg, CSS vars resolve correctly per theme, layout preserved across themes
- **Validate:** `npm test` -- all pass

---

## Phase 3: Codex-like Layout Redesign

**Goal:** Tree-view sidebar, remove header, add "New thread" button, gear icon, sidebar toggle.

### Step 3.1: Restructure sidebar -- remove header, add "New thread" + gear
- **Modify** `view/src/sidebar.ts` -- complete rewrite of `renderSidebar()`:
  - Top: "New thread" button (pen/edit icon + text)
  - Middle: scrollable `.sidebar-projects` with tree-view groups
  - Bottom: gear icon button pinned via flexbox
  - Remove: `.sidebar-header`, hamburger, menu dropdown
  - Add callbacks: `onNewThread()`, `onOpenSettings()`
- **Modify** `view/src/style.css` -- remove `.sidebar-header`, `.hamburger-btn`, `.menu-dropdown` styles; add `.sidebar-new-thread-btn`, `.sidebar-footer`, `.sidebar-gear-btn`
- **Validate:** Sidebar shows "New thread" at top, gear at bottom, no DACM header

### Step 3.2: Tree-view project groups with age labels
- **Modify** `view/src/sidebar.ts` -- project groups render as:
  - Chevron (expandable) + folder icon + project name
  - Tasks indented underneath with name + age label ("1mo", "1w", "3d")
  - Expand/collapse state in module-level `Set<number>`
  - `formatAge(createdAt)` helper function
  - Remove inline quick-task (+) button (replaced by start page prompt)
- **Modify** `view/src/style.css` -- add `.project-tree-header`, `.tree-chevron`, `.tree-folder-icon`, `.project-tree-children`, `.task-age` styles
- **Validate:** Projects show as collapsible tree nodes. Tasks show relative age

### Step 3.3: Sidebar toggle (full hide)
- **Modify** `view/src/main.ts`:
  - Add `sidebarVisible: boolean` to AppState (default: true)
  - Add toggle button to layout HTML (positioned near top-left, visible when sidebar hidden)
  - Wire `Cmd+B` keyboard shortcut
  - Apply `.sidebar--hidden` class when toggled off
- **Modify** `view/src/style.css` -- `.sidebar-toggle-btn` (fixed position, z-index), `.sidebar--hidden` (width:0, overflow:hidden, CSS transition), `.layout` transition for smooth animation
- **Validate:** Cmd+B hides/shows. Button stays visible. Main content expands. Smooth animation

### Step 3.4: Overlay title bar (macOS traffic-light integration)
- **Modify** `core/tauri.conf.json` -- set `"titleBarStyle": "overlay"` on the main window
- **Modify** `view/src/style.css` -- add top padding (~28px) to sidebar and main content for traffic light clearance; position sidebar toggle button near traffic lights
- **Validate:** Traffic lights overlay content. No UI overlap. Toggle button accessible

### Step 3.5: Project context menu (right-click)
- **Modify** `view/src/sidebar.ts` -- right-click on project tree header shows context menu: "Remove Project" (with confirm)
- **Modify** `view/src/style.css` -- `.context-menu` styles (fixed position, dropdown)
- **Validate:** Right-click shows menu. Left-click still expands/collapses

### Step 3.6: Playwright tests for layout redesign
- **Create** `view/tests/layout-redesign.spec.ts` -- no DACM header, "New thread" button present, tree chevrons work, age labels render, sidebar toggle hides/shows, gear icon at bottom
- **Validate:** `npm test` -- all pass

---

## Phase 4: Start Page (Codex-style Landing)

**Goal:** "Let's build [Project]" page with project picker and prompt input, one-click task+session creation.

### Step 4.1: Create start page component
- **Create** `view/src/start-page.ts`:
  - `renderStartPage(container, projects, selectedProjectId, callbacks)`
  - Layout: centered hero (Claude icon + "Let's build" + project picker dropdown) + bottom prompt input
  - Project picker: dropdown with folder icons + project list + "Add new project" at bottom
  - Enter in prompt: calls `onPromptSubmit(projectId, prompt)`
  - Callbacks: `onProjectSelect`, `onPromptSubmit`, `onAddProject`
- **Modify** `view/src/style.css` -- `.start-page`, `.start-page-hero`, `.start-page-title`, `.project-picker-btn`, `.project-picker-dropdown`, `.project-picker-item`, `.start-page-prompt`, `.start-page-input`
- **Validate:** Start page renders centered with all elements

### Step 4.2: Integrate start page with main.ts
- **Modify** `view/src/main.ts`:
  - Add `selectedProjectId: number | null` to AppState
  - When no task selected and view='tasks': render start page instead of old new-task form
  - `onPromptSubmit`: create task (name = truncated prompt) -> spawn session -> select task -> render
  - Wire `onNewThread` callback to deselect task (show start page)
- **Modify** `view/src/task-detail.ts` -- remove the "New Task" form rendering from the empty state (start-page.ts handles this now)
- **Validate:** No task selected shows start page. Type prompt + Enter: task created, session spawns, terminal appears

### Step 4.3: Playwright tests for start page
- **Create** `view/tests/start-page.spec.ts` -- "Let's build" visible, project picker dropdown works, prompt input accepts text, Enter triggers task creation mock, start page disappears after task creation
- **Validate:** `npm test` -- all pass

---

## Phase 5: Settings UI (Frontend Pages)

**Goal:** Settings page with sidebar nav and all 3 pages: General, Worktrees, Archived Threads.

### Step 5.1: Settings navigation and routing
- **Modify** `view/src/main.ts`:
  - Extend AppState: `view: 'tasks' | 'settings'`, `settingsPage: 'general' | 'worktrees' | 'archived'`
  - In `render()`: when `view === 'settings'`, render settings nav in sidebar + settings page in main content
  - Wire gear icon `onOpenSettings` -> set view='settings'
  - Add `Cmd+,` keyboard shortcut to open settings
- **Create** `view/src/settings-nav.ts`:
  - `renderSettingsNav(container, activePage, callbacks)`
  - "Back to app" link at top, then General / Worktrees / Archived Threads nav items
- **Modify** `view/src/style.css` -- `.settings-nav`, `.settings-nav-back`, `.settings-nav-item`, `.settings-nav-item--active`
- **Validate:** Gear opens settings, "Back to app" returns, nav items switch pages

### Step 5.2: General settings page
- **Create** `view/src/settings-general.ts`:
  - `renderGeneralSettings(container, settings, callbacks)`
  - **Theme**: 3-segment toggle (Light / Dark / System) -- calls `setTheme()` immediately
  - **Prevent sleep**: toggle switch -- calls `set_prevent_sleep` Tauri command
  - **Code font**: family text input + size number input (min 8, max 24)
  - **Terminal font**: family text input + size number input (min 8, max 24)
  - All changes persist via `setSetting()`
- **Modify** `view/src/style.css` -- `.settings-page`, `.settings-section`, `.settings-row`, `.segmented-control`, `.toggle-switch`, `.settings-input`
- **Validate:** All controls render with current values. Theme toggle changes theme immediately

### Step 5.3: Prevent-sleep Tauri command
- **Create** `core/src/sleep_commands.rs`:
  - `set_prevent_sleep(prevent: bool)` -- spawns/kills `caffeinate -d -i` child process
  - `SleepState { child: Mutex<Option<Child>> }` managed state
- **Modify** `core/src/main.rs` -- add module, register command, manage SleepState, kill on exit
- **Validate:** Toggle on: `ps aux | grep caffeinate` shows process. Toggle off: process killed

### Step 5.4: Wire font settings to terminal
- **Modify** `view/src/terminal.ts` -- read `terminal_font_family` and `terminal_font_size` from settings when creating Terminal instances
- **Modify** `view/src/main.ts` -- after loading settings, set `--code-font-family` and `--code-font-size` CSS custom properties on `:root`
- **Validate:** Change terminal font size in settings, create new terminal -- uses new size

### Step 5.5: Worktrees settings page
- **Create** `view/src/settings-worktrees.ts`:
  - `renderWorktreeSettings(container, settings, worktrees, callbacks)`
  - Top section: base path input, branch naming pattern input with `{task_name}` placeholder help
  - Bottom section: list of active worktrees (empty state for now -- backend worktree scanning is future work)
- **Validate:** Inputs persist via settings API

### Step 5.6: Archived Threads settings page
- **Create** `view/src/settings-archived.ts`:
  - `renderArchivedSettings(container, archivedTasks, callbacks)`
  - List of archived tasks: name, project, date
  - "Restore" button -> `update_task_status(id, "waiting")`
  - "Delete" button -> `delete_task(id)` (new command)
- **Add** `core/src/task_commands.rs` -- `list_archived_tasks()` and `delete_task(task_id)` commands
- **Modify** `core/src/main.rs` -- register new commands
- **Validate:** Archived page lists tasks. Restore/Delete call correct commands

### Step 5.7: Playwright tests for all settings pages
- **Create** `view/tests/settings.spec.ts` -- gear opens settings, nav works, "Back to app" works
- **Create** `view/tests/settings-general.spec.ts` -- theme toggle, font inputs, prevent sleep toggle
- **Create** `view/tests/settings-worktrees.spec.ts` -- base path + pattern inputs persist
- **Create** `view/tests/settings-archived.spec.ts` -- archived list renders, restore/delete invoke correct commands
- **Validate:** `npm test` -- all pass

---

## Phase 6: Polish and Shared Utilities

**Goal:** Extract duplicated code, add transitions, finalize keyboard shortcuts.

### Step 6.1: Extract shared utilities
- **Create** `view/src/utils.ts` -- extract `escapeHtml()` (duplicated in sidebar.ts, task-detail.ts, debug-panel.ts), `formatAge()`
- **Modify** `view/src/sidebar.ts`, `view/src/task-detail.ts`, `view/src/debug-panel.ts` -- import from utils.ts, remove local copies
- **Validate:** `npx tsc --noEmit`, all Playwright tests pass

### Step 6.2: CSS transitions and animations
- **Modify** `view/src/style.css`:
  - Sidebar toggle: smooth width/opacity transition (~200ms)
  - Theme switch: `transition: color 150ms, background-color 150ms` on `*`
  - Settings page: fade-in transition
  - Tree chevron: rotation animation on expand/collapse
- **Validate:** Visual smoothness on sidebar toggle, theme switch, settings navigation

### Step 6.3: Keyboard shortcuts consolidation
- **Modify** `view/src/main.ts` -- centralized keyboard handler:
  - `Cmd+B` -- toggle sidebar
  - `Cmd+,` -- open settings
  - `Cmd+N` -- new thread (deselect task, focus prompt)
  - `Ctrl+Shift+D` -- debug panel (existing)
  - `Escape` -- close settings / close dropdown / deselect
  - Only fire when terminal is NOT focused (check `document.activeElement`)
- **Validate:** All shortcuts work, don't conflict with xterm.js

### Step 6.4: Final integration tests
- **Create** `view/tests/integration.spec.ts` -- full flows:
  - Start -> select project -> prompt -> task created -> terminal -> kill -> detail -> archive -> archived list -> restore
  - Open settings -> change theme -> back -> theme persists
  - Sidebar toggle -> hidden -> show -> layout correct
- **Validate:** `npm test` -- full suite passes

---

## New Files Summary

**Frontend (14 new TS files):**
- `view/src/theme.ts`, `view/src/settings-api.ts`, `view/src/settings-nav.ts`
- `view/src/settings-general.ts`, `view/src/settings-worktrees.ts`, `view/src/settings-archived.ts`
- `view/src/start-page.ts`, `view/src/utils.ts`
- `view/playwright.config.ts`
- `view/tests/mocks/tauri-mock.ts`, `view/tests/fixtures.ts`, `view/tests/helpers.ts`
- Test specs: `sidebar.spec.ts`, `task-detail.spec.ts`, `layout.spec.ts`, `theme.spec.ts`, `layout-redesign.spec.ts`, `start-page.spec.ts`, `settings.spec.ts`, `settings-general.spec.ts`, `settings-worktrees.spec.ts`, `settings-archived.spec.ts`, `settings-api.spec.ts`, `integration.spec.ts`

**Backend (4 new RS files + 1 migration):**
- `core/src/settings_models.rs`, `core/src/settings_commands.rs`, `core/src/sleep_commands.rs`
- `core/migrations/00000000000002_create_settings/up.sql` + `down.sql`

## Verification Strategy

Every phase ends with `npm test` (Playwright) + `cargo check`. The Tauri mock layer in `view/tests/mocks/tauri-mock.ts` intercepts all `invoke()` calls so tests run against Vite dev server alone -- no Rust backend needed. Visual validation is done via Playwright assertions on DOM state (class names, computed styles, text content). After Phase 6, run `cargo tauri dev` for manual end-to-end verification with the real backend.
