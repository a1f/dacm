# Plan: Terminal-First UX with Auto-Spawn and Model Selector

## Context

The start page (header + project picker + prompt textarea) adds friction. The user wants to skip it entirely: select a project → Claude terminal appears immediately. A slim bottom toolbar provides model/interface selection (Claude/Codex) and project switching. Model selection is functional — different interfaces spawn different CLIs, and `--model` flag is passed.

## Architecture

### New Flow
1. App starts → load projects → auto-select last-used project (persisted in settings)
2. No task selected + project exists → auto-create task ("Chat Feb 14, 3:42 PM") → spawn Claude session → show terminal
3. User types directly into xterm.js (no custom prompt input)
4. Bottom toolbar: `[Opus 4.6 ▾] [Auto ▾]  ...  [🔀 main] [📁 project-name ▾]`
5. Changing project via toolbar/sidebar → kill session → auto-spawn in new dir
6. "New Thread" → creates new task + session (old session stays in sidebar)

### Layout
```
┌─────────────────────────────────────┐
│ Session Header (task name, buttons) │  flex-shrink: 0
├─────────────────────────────────────┤
│                                     │
│    xterm.js Terminal (Claude CLI)   │  flex: 1
│                                     │
├─────────────────────────────────────┤
│ Opus 4.6 ▾  Auto ▾    🔀main  /path│  flex-shrink: 0, 32px
└─────────────────────────────────────┘
```

## Files Modified

| File | Changes |
|------|---------|
| `view/src/types.ts` | Add CodingInterface, ModelOption, AVAILABLE_MODELS, findModel |
| `core/src/session.rs` | Add `cli_command` + `model` params to `spawn()` |
| `core/src/session_commands.rs` | Add `cli_command` + `model` params to `spawn_session()` |
| `view/src/main.ts` | Remove start page, add auto-spawn, state changes, toolbar wiring |
| `view/src/toolbar.ts` | NEW — bottom toolbar with model/project dropdowns |
| `view/src/task-detail.ts` | Extended callbacks, toolbar integration |
| `view/src/style.css` | Bottom toolbar + dropdown styles |

## Edge Cases
- **Double-spawn guard**: `autoSpawning` flag prevents multiple tasks when render() fires rapidly
- **No projects**: Show "Add a project" button instead of auto-spawn
- **Codex not installed**: spawn fails gracefully, user switches back to Claude
- **Model change**: Applies to next session (no auto-restart of current session)

---

## Execution Plan

Each sub-step is one commit. Verify `cargo check` and `npx tsc --noEmit` pass after each.

---

### 1. Model type definitions

#### 1.1 Add CodingInterface type and ModelOption interface to `types.ts`
- **File**: `view/src/types.ts`
- Add `CodingInterface` type: `"claude" | "codex"`
- Add `ModelOption` interface: `{ id: string; label: string; interface: CodingInterface }`
- Add `ModelGroup` interface: `{ interface: CodingInterface; label: string; models: ModelOption[] }`
- **Commit**: `feat(types): add CodingInterface and ModelOption types`

#### 1.2 Add AVAILABLE_MODELS constant and findModel helper to `types.ts`
- **File**: `view/src/types.ts`
- Add `AVAILABLE_MODELS` array with two groups:
  - Claude: Opus 4.6 (`claude-opus-4-6`), Sonnet 4.5 (`claude-sonnet-4-5`), Haiku 4.5 (`claude-haiku-4-5`)
  - Codex: o3 (`o3`), o4-mini (`o4-mini`)
- Add `DEFAULT_MODEL_ID = "claude-opus-4-6"`
- Add `findModel(id: string): ModelOption | undefined` — iterates groups to find by id
- **Commit**: `feat(types): add AVAILABLE_MODELS constant and findModel helper`

---

### 2. Backend — CLI command + model params

#### 2.1 Extend `session.rs` spawn() with `cli_command` and `model` params
- **File**: `core/src/session.rs`
- Add params: `cli_command: Option<String>`, `model: Option<String>`
- Replace `CommandBuilder::new("claude")` with `CommandBuilder::new(cli_command.as_deref().unwrap_or("claude"))`
- Before the `initial_prompt` arg block, add: if `model.is_some()` → `cmd.arg("--model"); cmd.arg(m)`
- Update the eprintln log to show `program` instead of hardcoded "claude"
- **Commit**: `feat(session): support cli_command and model params in spawn`

#### 2.2 Extend `session_commands.rs` spawn_session() to accept and pass through new params
- **File**: `core/src/session_commands.rs`
- Add params to `spawn_session`: `cli_command: Option<String>`, `model: Option<String>`
- Pass them through to `session_mgr.spawn(..., cli_command, model)`
- **Commit**: `feat(session_commands): pass cli_command and model to spawn`

---

### 3. Frontend state + persistence

#### 3.1 Add `selectedModelId` and `autoSpawning` to AppState in `main.ts`
- **File**: `view/src/main.ts`
- Add to `AppState` interface: `selectedModelId: string`, `autoSpawning: boolean`
- Initialize: `selectedModelId: "claude-opus-4-6"`, `autoSpawning: false`
- Add import of `DEFAULT_MODEL_ID` from `types.ts`
- **Commit**: `feat(main): add selectedModelId and autoSpawning to state`

#### 3.2 Add `loadPersistedState()` and wire into init chain
- **File**: `view/src/main.ts`
- Add `loadPersistedState()` async function:
  - Load `last_project_id` from settings → set `state.selectedProjectId` if project exists
  - Load `selected_model_id` from settings → set `state.selectedModelId` if model valid (via `findModel`)
  - Fallback: if no project selected but projects exist, pick first
- Call after `refresh()` in the init chain, then `render()` again
- Add `setSetting` to the import from `settings-api.ts`
- Add `findModel` to the import from `types.ts`
- **Commit**: `feat(main): persist and restore last project and model selection`

#### 3.3 Pass `cliCommand` and `model` through `spawnSessionForTask()`
- **File**: `view/src/main.ts`
- In `spawnSessionForTask()`, before the `invoke("spawn_session")` call:
  - `const modelOpt = findModel(state.selectedModelId)`
  - `const cliCommand = modelOpt?.interface ?? "claude"`
- Add `cliCommand` and `model: state.selectedModelId` to the `invoke` params
- **Commit**: `feat(main): pass cli interface and model to spawn_session`

---

### 4. Bottom toolbar component

#### 4.1 Create `toolbar.ts` with `renderToolbar()` — static HTML rendering
- **File**: `view/src/toolbar.ts` (NEW)
- Define `ToolbarProps`: `{ selectedModelId, selectedProject, projects, branchName }`
- Define `ToolbarCallbacks`: `{ onModelChange, onProjectChange, onAddProject }`
- Implement `renderToolbar(container, props, callbacks)`:
  - Creates `.bottom-toolbar` div with left/right sections
  - Left: model chip button showing `"{Interface} {Model} ▾"`, mode chip "Auto ▾"
  - Right: branch info span `"🔀 main"`, project path chip button `"📁 {name} ▾"`
  - Appends to container
  - Returns the toolbar element
- SVG icons: `CHEVRON_DOWN`, `BRANCH_ICON`, `FOLDER_ICON` as module constants
- No dropdown logic yet — just static chips
- **Commit**: `feat(toolbar): create toolbar component with static chips`

#### 4.2 Add model dropdown to toolbar
- **File**: `view/src/toolbar.ts`
- Module-level `activeDropdown` variable and `closeDropdown()` helper
- On model chip click: create `.toolbar-dropdown` with grouped items
  - For each group in `AVAILABLE_MODELS`: render group label + model items
  - Active model gets `.toolbar-dropdown-item--active` class
  - On item click: call `callbacks.onModelChange(modelId)`, close dropdown
- Position dropdown with `position: fixed`, anchored above the button
- Click-outside-to-close via `document.addEventListener("click", closeDropdown, { once: true })`
- **Commit**: `feat(toolbar): add model/interface dropdown with grouped options`

#### 4.3 Add project dropdown to toolbar
- **File**: `view/src/toolbar.ts`
- On project chip click: create `.toolbar-dropdown` with project list
  - For each project: render item with folder icon and name
  - Active project gets `.toolbar-dropdown-item--active`
  - Separator + "Add project" item at bottom
  - On project click: `callbacks.onProjectChange(projectId)`
  - On add click: `callbacks.onAddProject()`
- Same positioning and close-on-click-outside pattern as model dropdown
- **Commit**: `feat(toolbar): add project picker dropdown`

#### 4.4 Add toolbar CSS styles
- **File**: `view/src/style.css`
- Add `.bottom-toolbar`: flex, space-between, 32px height, `var(--sidebar-bg)` background, border-top, flex-shrink: 0
- Add `.bottom-toolbar-left`, `.bottom-toolbar-right`: flex with gap
- Add `.toolbar-project-btn`: max-width 200px, ellipsis overflow
- Add `.toolbar-dropdown`: fixed position, dropdown-bg, border, border-radius, shadow, z-index 200
- Add `.toolbar-dropdown-group-label`: uppercase, small, muted color, padding
- Add `.toolbar-dropdown-item`: full width button, hover bg, flex with gap
- Add `.toolbar-dropdown-item--active`: accent color
- Add `.toolbar-dropdown-separator`: 1px line
- **Commit**: `feat(style): add bottom toolbar and dropdown CSS`

---

### 5. Integrate toolbar into task-detail

#### 5.1 Extend `TaskDetailCallbacks` with toolbar callbacks
- **File**: `view/src/task-detail.ts`
- Add to `TaskDetailCallbacks` interface:
  - `onModelChange: (modelId: string) => void`
  - `onProjectChange: (projectId: number) => void`
  - `onAddProject: () => void`
- Add import of `renderToolbar` from `toolbar.ts`
- Add import of `ToolbarProps` type from `toolbar.ts`
- No functional change yet — just the interface extension
- **Commit**: `feat(task-detail): extend callbacks interface for toolbar`

#### 5.2 Add toolbar props to `renderTaskDetail` and thread through
- **File**: `view/src/task-detail.ts`
- Add `toolbarProps: ToolbarProps` parameter to `renderTaskDetail()`
- Pass `toolbarProps` through to `renderTerminalView()` and `renderNoSessionView()`
- Update internal function signatures to accept `toolbarProps`
- **Commit**: `feat(task-detail): accept toolbar props in render functions`

#### 5.3 Render toolbar in `renderTerminalView()` and `renderNoSessionView()`
- **File**: `view/src/task-detail.ts`
- In `renderTerminalView()`:
  - After appending the terminal wrapper (both cached and new paths): call `renderToolbar(container, toolbarProps, { onModelChange, onProjectChange, onAddProject })`
  - On same-session re-render: remove existing `.bottom-toolbar` and re-render it (to update model/project display)
- In `renderNoSessionView()`:
  - After the main innerHTML, call `renderToolbar(container, toolbarProps, callbacks)`
- **Commit**: `feat(task-detail): render bottom toolbar below terminal`

#### 5.4 Wire toolbar callbacks in `main.ts` render() call site
- **File**: `view/src/main.ts`
- Build `toolbarProps` object: `{ selectedModelId, selectedProject, projects, branchName: task.branch_name }`
- Pass `toolbarProps` to `renderTaskDetail()`
- Add callback implementations:
  - `onModelChange(modelId)`: update `state.selectedModelId`, persist via `setSetting("selected_model_id", modelId)`, `render()`
  - `onProjectChange(projectId)`: kill current session if running, set `selectedProjectId`, set `selectedTaskId = null`, persist, `render()`
  - `onAddProject()`: open directory dialog, invoke `add_project`, refresh
- **Commit**: `feat(main): wire toolbar callbacks for model and project switching`

---

### 6. Remove start page + add auto-spawn

#### 6.1 Replace start page rendering with auto-spawn logic
- **File**: `view/src/main.ts`
- Replace the `if (!task) { ... renderStartPage(...) ... }` block with:
  - If no projects: render "No projects configured" + "Add a project" button in terminal-mode layout
  - If `autoSpawning`: return early (guard)
  - Otherwise: set `autoSpawning = true`, show "Starting session..." loading state
  - Async IIFE: create task with name `"Chat {date}"`, spawn session, render, finally reset `autoSpawning`
- Add `escapeHtml` import from `utils.ts`
- Add `open` import already exists from `@tauri-apps/plugin-dialog`
- **Commit**: `feat(main): replace start page with auto-spawn on project select`

#### 6.2 Remove start page import and unused code
- **File**: `view/src/main.ts`
- Remove `import { renderStartPage } from "./start-page.ts"`
- Remove the `requestAnimationFrame` block in `Cmd+N` handler that focuses `#start-page-input`
- **Commit**: `refactor(main): remove start page import and focus hack`

#### 6.3 Add toolbar to auto-spawn loading and empty states
- **File**: `view/src/main.ts`
- In the "no projects" empty state: render toolbar with no project selected (shows "No project" + add project button)
- In the "Starting session..." loading state: render toolbar with current project/model
- Import `renderToolbar` and build props for these states
- **Commit**: `feat(main): show toolbar in loading and empty states`

---

### 7. Project switching

#### 7.1 Handle project switch from sidebar
- **File**: `view/src/main.ts`
- Update `onNewTaskForProject(projectId)` callback:
  - If `projectId !== state.selectedProjectId` and a task is selected: kill current session
  - Set `selectedTaskId = null`, `selectedProjectId = projectId`
  - Persist `last_project_id`
  - `render()` → triggers auto-spawn for new project
- **Commit**: `feat(main): handle project switch from sidebar with session restart`

#### 7.2 Ensure "New Thread" triggers auto-spawn
- **File**: `view/src/main.ts`
- Verify `onNewThread()` callback sets `selectedTaskId = null` and calls `render()`
- This already triggers the auto-spawn logic from step 6.1 — no code change needed, just verify
- If the current project needs to be preserved: ensure `selectedProjectId` is not cleared
- **Commit**: `fix(main): preserve selected project on new thread` (only if change needed)

---

## Step Tracker

### 1. Model type definitions
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
1.1   pending  Add CodingInterface + ModelOption types
               Why: Foundation types all other code depends on
               Check: npx tsc --noEmit
────  ───────  ──────────────────────────────────────────────────
1.2   pending  Add AVAILABLE_MODELS + findModel helper
               Why: Lookup table for toolbar and spawn logic
               Check: npx tsc --noEmit
```

### 2. Backend — CLI command + model
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
2.1   pending  Extend session.rs spawn() with cli_command + model
               Why: Backend must accept which CLI/model to run
               Check: cargo check
────  ───────  ──────────────────────────────────────────────────
2.2   pending  Extend session_commands.rs to pass through params
               Why: Tauri command layer must forward new params
               Check: cargo check
```

### 3. Frontend state + persistence
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
3.1   pending  Add selectedModelId + autoSpawning to AppState
               Why: State needed before any UI can use it
               Check: npx tsc --noEmit
────  ───────  ──────────────────────────────────────────────────
3.2   pending  Add loadPersistedState() for last project + model
               Why: Restore user's last session on app restart
               Check: npx tsc --noEmit; app remembers project
────  ───────  ──────────────────────────────────────────────────
3.3   pending  Pass cliCommand + model through spawnSessionForTask
               Why: Connect frontend model choice to backend spawn
               Check: cargo check + npx tsc --noEmit
```

### 4. Bottom toolbar component
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
4.1   pending  Create toolbar.ts with static chip rendering
               Why: Visual scaffold before adding interactivity
               Check: npx tsc --noEmit; file exists
────  ───────  ──────────────────────────────────────────────────
4.2   pending  Add model dropdown to toolbar
               Why: Users need to pick interface + model
               Check: dropdown opens/closes on click
────  ───────  ──────────────────────────────────────────────────
4.3   pending  Add project dropdown to toolbar
               Why: Users need to switch projects from toolbar
               Check: dropdown shows projects list
────  ───────  ──────────────────────────────────────────────────
4.4   pending  Add toolbar + dropdown CSS
               Why: Toolbar invisible without styles
               Check: toolbar at bottom, 32px, styled chips
```

### 5. Integrate toolbar into task-detail
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
5.1   pending  Extend TaskDetailCallbacks for toolbar
               Why: task-detail needs to forward toolbar events
               Check: npx tsc --noEmit
────  ───────  ──────────────────────────────────────────────────
5.2   pending  Add toolbarProps param to renderTaskDetail
               Why: Thread toolbar data into the render tree
               Check: npx tsc --noEmit
────  ───────  ──────────────────────────────────────────────────
5.3   pending  Render toolbar in terminal + no-session views
               Why: Toolbar must be visible in all task states
               Check: toolbar below terminal and in ended view
────  ───────  ──────────────────────────────────────────────────
5.4   pending  Wire toolbar callbacks in main.ts
               Why: Connect dropdown actions to state changes
               Check: model persists; project switch re-spawns
```

### 6. Remove start page + add auto-spawn
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
6.1   pending  Replace start page with auto-spawn logic
               Why: Core UX change — terminal appears immediately
               Check: app starts with terminal, no start page
────  ───────  ──────────────────────────────────────────────────
6.2   pending  Remove start page import + focus hack
               Why: Dead code cleanup
               Check: npx tsc --noEmit; no runtime errors
────  ───────  ──────────────────────────────────────────────────
6.3   pending  Add toolbar to loading + empty states
               Why: Toolbar visible even before session starts
               Check: toolbar in "Starting..." and "No projects"
```

### 7. Project switching
```
Step  Status   Description
────  ───────  ──────────────────────────────────────────────────
7.1   pending  Handle project switch from sidebar
               Why: Sidebar project switch must kill + respawn
               Check: switch project → old killed, new starts
────  ───────  ──────────────────────────────────────────────────
7.2   pending  Verify New Thread triggers auto-spawn
               Why: New Thread must create fresh session
               Check: New Thread → new task + session in sidebar
```

## Verification

After all steps:

1. `cargo check` — Rust compiles
2. `cd view && npx tsc --noEmit` — TypeScript compiles
3. `cargo tauri dev` — manual testing:
   - App starts → terminal appears immediately with Claude session
   - Bottom toolbar shows model/mode/branch/project
   - Model dropdown shows Claude/Codex grouped options, selected model highlighted
   - Selecting different model persists across app restart
   - Project dropdown shows all projects + "Add project"
   - Switching project kills old session, starts new one in new directory
   - "New Thread" button creates fresh session, old stays in sidebar
   - Sidebar still shows all tasks, clicking switches between terminals
   - No projects state shows "Add a project" prompt
   - Codex model selected but codex not installed → graceful error
