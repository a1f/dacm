# Plan: Claude Code Session Management (PTY + xterm.js)

## Context

DACM's core purpose is managing multiple Claude Code sessions from a single desktop window. Currently the app has project/task CRUD with a static detail panel and a dummy "simulate" button. This plan implements the first real session management: spawning Claude CLI processes via PTY, rendering them with xterm.js, and managing their lifecycle.

The approach uses `portable-pty` (Rust) + `xterm.js` (frontend) to get full Claude Code compatibility — all / commands, skills, ANSI rendering, and interactive features work out of the box since we're running the real CLI in a pseudo-terminal.

---

## Step 0: Dependencies & Setup ✅ COMPLETED

**Files to modify:**
- `core/Cargo.toml` — add `portable-pty = "0.9"`, `uuid = { version = "1", features = ["v4"] }`
- `view/package.json` — add `@xterm/xterm` (^5.5.0), `@xterm/addon-fit` (^0.10.0)

**Validation:** `cargo check` compiles, `npm install` succeeds, `npx tsc --noEmit` passes

---

## Step 1: Session Manager (Rust backend) ✅ COMPLETED

**Storage: In-memory only (no DB).** Sessions hold live PTY handles and child processes which cannot be serialized to SQLite. The `SessionManager` is a runtime-only `Mutex<HashMap>` that lives in Tauri's managed state. Sessions are ephemeral — they exist only while the app is running. On app close, all sessions are killed. Task status in the DB (running/waiting/completed) is updated separately via existing `update_task_status` commands when sessions start or end.

**New file: `core/src/session.rs`**

Core types:
- `SessionHandle` — holds PTY master, writer, child process, metadata (task_id, project_id, pid, started_at, status, working_dir). Not serializable — runtime only.
- `SessionManager` — `Mutex<HashMap<String, SessionHandle>>` (in-memory, not persisted) with methods:
  - `spawn(task_id, project_id, working_dir, initial_prompt, rows, cols) -> Result<String>` — opens PTY, spawns `claude` with cwd, returns session_id (UUID)
  - `write(session_id, data)` — sends bytes to PTY
  - `resize(session_id, rows, cols)` — resizes PTY
  - `kill(session_id)` — kills child process
  - `kill_all()` — terminates all sessions (for shutdown)
  - `take_reader(session_id)` — clones PTY reader for streaming thread
  - `list()` — returns `Vec<SessionInfo>` for debug view
  - `remove(session_id)` — removes dead session from map
- `SessionInfo` — serializable info struct (session_id, task_id, pid, uptime, status, working_dir, stderr_tail)
- `Drop` impl on `SessionManager` calls `kill_all()`

**New file: `core/src/session_commands.rs`**

Tauri commands wrapping SessionManager:
- `spawn_session`, `write_to_session`, `resize_session`, `kill_session`, `list_sessions`, `start_session_stream`

**Modify: `core/src/main.rs`**
- Add `mod session; mod session_commands;`
- `app.manage(session::SessionManager::new())` in setup
- Register all session commands in `invoke_handler`
- Change from `.run(generate_context!())` to `.build(generate_context!()).run()` with `RunEvent::ExitRequested` handler that calls `session_mgr.kill_all()`

---

## Step 2: PTY Output Streaming ✅ COMPLETED

**In `session_commands.rs`:**

`start_session_stream` command:
1. Takes `session_id`, calls `session_mgr.take_reader()`
2. Spawns a `tauri::async_runtime::spawn_blocking` thread
3. Reads PTY output in 4096-byte chunks
4. Emits `session-output-{session_id}` events with `Vec<u8>` payload
5. On EOF, emits `session-exit-{session_id}`, marks session as exited

Data flow: PTY reader -> background thread -> `app_handle.emit()` -> frontend `listen()`

---

## Step 3: Frontend xterm.js Integration

**New file: `view/src/terminal.ts`**

`createTerminalSession(container, sessionId, onExit)` function:
1. Creates `Terminal` with dark theme matching DACM (#1a1a2e bg, #24c8db cursor)
2. Loads `FitAddon`, opens terminal in container, fits
3. Listens `session-output-{id}` — decodes bytes with `TextDecoder({stream: true})`, writes to xterm
4. Listens `session-exit-{id}` — writes "[Session ended]", calls `onExit`
5. `terminal.onData()` — encodes to bytes, invokes `write_to_session`
6. `terminal.onResize()` — invokes `resize_session`
7. `ResizeObserver` on container — calls `fitAddon.fit()`
8. Calls `start_session_stream` and initial `resize_session`
9. Returns `{ terminal, sessionId, destroy() }` — destroy cleans up listeners, observer, terminal

**Modify: `view/src/style.css`**
- Add `.terminal-container` (fills main content, 100% height)
- Add `.session-header` (task name + kill button bar above terminal)
- Add `.main-content.terminal-mode` (no padding, flex column, no overflow)

---

## Step 4: Task Creation Spawns Claude

**Modify: `view/src/main.ts`**
- Add `activeSessions: Map<number, string>` to `AppState` (taskId -> sessionId)
- Add `debugMode: boolean` to `AppState`
- In `onNewTask` and `onQuickTask`: after `create_task`, invoke `spawn_session` with project path, store in `activeSessions`, update status to "running"
- In `render()`: pass `activeSessionId` to `renderTaskDetail`
- Add `onKillSession` callback: invoke `kill_session`, remove from map, update status

**Modify: `view/src/task-detail.ts`**
- Add `activeSessionId: string | null` parameter to `renderTaskDetail`
- Track `activeTerminal: TerminalSession | null` at module level
- If `activeSessionId` exists and no terminal yet: render session header + terminal container, call `createTerminalSession`
- If terminal already exists for this session: skip re-render (preserve terminal state)
- If no active session: render existing static detail view
- Add `onKillSession` to `TaskDetailCallbacks`

**Modify: `view/src/types.ts`**
- Add `SessionInfo` and `SessionStatus` types

---

## Step 5: Debug View

**New file: `view/src/debug-panel.ts`**

`renderDebugPanel(container, callbacks)`:
- Invokes `list_sessions` to get all `SessionInfo[]`
- Renders table: PID, Working Dir, Task, Status, Uptime, Kill button
- Renders stderr output blocks for sessions with stderr
- Refresh button re-fetches and re-renders
- Close button exits debug mode

**Modify: `view/src/main.ts`**
- In `render()`: if `state.debugMode`, render debug panel instead of normal content
- Add keyboard shortcut `Ctrl+Shift+D` to toggle debug mode
- Add debug button in sidebar (or header)

**Modify: `view/src/style.css`**
- Add `.debug-panel`, `.debug-table`, `.debug-stderr` styles

---

## Files Summary

| File | Action | What |
|------|--------|------|
| `core/Cargo.toml` | Modify | Add portable-pty, uuid |
| `view/package.json` | Modify | Add @xterm/xterm, @xterm/addon-fit |
| `core/src/session.rs` | **Create** | SessionManager, PTY lifecycle |
| `core/src/session_commands.rs` | **Create** | Tauri commands for sessions |
| `core/src/main.rs` | Modify | Wire state, commands, shutdown |
| `view/src/terminal.ts` | **Create** | xterm.js wrapper + event bridge |
| `view/src/task-detail.ts` | Modify | Terminal mode vs detail mode |
| `view/src/main.ts` | Modify | Session tracking, spawn on create |
| `view/src/types.ts` | Modify | Add session types |
| `view/src/style.css` | Modify | Terminal + debug styles |
| `view/src/debug-panel.ts` | **Create** | Debug sessions panel |

---

## Verification

1. `cargo check` — compiles with new dependencies
2. `cargo tauri dev` — app launches
3. Create a task for a project — Claude process spawns, terminal appears in main panel
4. Type in the terminal — Claude responds, ANSI colors render correctly
5. Use `/help` in the terminal — Claude Code skill works
6. Resize the window — terminal resizes properly
7. Click Kill button — Claude process terminates, session ends
8. `Ctrl+Shift+D` — debug panel shows session info
9. Close the app window — all Claude processes terminate (check `ps aux | grep claude`)
10. Create multiple tasks — each gets its own session, switching tasks switches terminals
