import type { Page } from "@playwright/test";
import type { Project, Task, SessionInfo } from "../../src/types.ts";
import type { MockSetting } from "../../mocks/mock-data.ts";

export interface MockData {
  projects: Project[];
  tasks: Task[];
  sessions: SessionInfo[];
  settings?: MockSetting[];
}

/**
 * Build the JavaScript string that will be injected into the page via addInitScript.
 * This replaces window.__TAURI_INTERNALS__ so the Tauri API modules work without a real backend.
 */
function buildInitScript(data: MockData): string {
  const json = JSON.stringify(data);

  // This script runs in the browser context before any app code.
  // It mirrors the shape that @tauri-apps/api/mocks.mockIPC sets up.
  return `
(function() {
  const _data = ${json};

  // Mutable state so tests can add/modify tasks and settings
  const state = {
    projects: _data.projects,
    tasks: _data.tasks,
    sessions: _data.sessions,
    settings: _data.settings || [],
    nextTaskId: Math.max(0, ..._data.tasks.map(t => t.id)) + 1,
  };

  // Expose state for test assertions
  window.__MOCK_STATE__ = state;

  // --- Callback registry (mirrors transformCallback / unregisterCallback) ---
  const callbacks = new Map();

  function registerCallback(callback, once) {
    const id = crypto.getRandomValues(new Uint32Array(1))[0];
    callbacks.set(id, function(data) {
      if (once) callbacks.delete(id);
      return callback && callback(data);
    });
    return id;
  }

  function unregisterCallback(id) {
    callbacks.delete(id);
  }

  function runCallback(id, data) {
    const cb = callbacks.get(id);
    if (cb) cb(data);
  }

  // --- Event plugin internals ---
  const listeners = new Map();

  function handleListen(args) {
    if (!listeners.has(args.event)) listeners.set(args.event, []);
    listeners.get(args.event).push(args.handler);
    return args.handler;
  }

  function handleEmit(args) {
    const eventListeners = listeners.get(args.event) || [];
    for (const handler of eventListeners) {
      runCallback(handler, { event: args.event, payload: args.payload });
    }
    return null;
  }

  function handleUnlisten(args) {
    const eventListeners = listeners.get(args.event);
    if (eventListeners) {
      const idx = eventListeners.indexOf(args.eventId);
      if (idx !== -1) eventListeners.splice(idx, 1);
    }
  }

  // --- Command handlers ---
  function handleCommand(cmd, args) {
    switch (cmd) {
      case "list_projects":
        return state.projects;

      case "list_all_tasks":
        return state.tasks.filter(t => t.status !== "archived");

      case "list_sessions":
        return state.sessions;

      case "create_task": {
        const task = {
          id: state.nextTaskId++,
          name: args.name || "Untitled",
          description: args.description || "",
          summary: "",
          task_id: null,
          project_id: args.projectId,
          status: "waiting",
          start_time: null,
          iteration_count: 0,
          worktree_path: null,
          branch_name: null,
          created_at: new Date().toISOString(),
        };
        state.tasks.push(task);
        return task;
      }

      case "update_task_status": {
        const task = state.tasks.find(t => t.id === args.taskId);
        if (!task) throw new Error("Task not found: " + args.taskId);
        task.status = args.status;
        return { ...task };
      }

      case "archive_task": {
        const task = state.tasks.find(t => t.id === args.taskId);
        if (!task) throw new Error("Task not found: " + args.taskId);
        task.status = "archived";
        return { ...task };
      }

      case "add_project": {
        const name = args.path.split("/").pop() || args.path;
        const project = {
          id: Math.max(0, ...state.projects.map(p => p.id)) + 1,
          name,
          path: args.path,
          created_at: new Date().toISOString(),
        };
        state.projects.push(project);
        return project;
      }

      case "remove_project": {
        state.projects = state.projects.filter(p => p.id !== args.id);
        return null;
      }

      case "spawn_session":
        return "mock-session-" + args.taskId;

      case "kill_session":
        return null;

      case "write_to_session":
        return null;

      case "resize_session":
        return null;

      case "start_session_stream":
        return null;

      case "simulate_task":
        return null;

      // Settings commands
      case "list_settings":
        return state.settings;

      case "get_setting": {
        const setting = state.settings.find(s => s.key === args.key);
        return setting ? setting.value : "";
      }

      case "set_setting": {
        const existing = state.settings.find(s => s.key === args.key);
        if (existing) {
          existing.value = args.value;
        } else {
          state.settings.push({ key: args.key, value: args.value });
        }
        return null;
      }

      case "list_archived_tasks":
        return state.tasks.filter(t => t.status === "archived");

      case "delete_task": {
        state.tasks = state.tasks.filter(t => t.id !== args.taskId);
        return null;
      }

      case "set_prevent_sleep":
        return null;

      // Dialog plugin
      case "plugin:dialog|open":
        return null;

      default:
        console.warn("[tauri-mock] Unhandled command:", cmd, args);
        return null;
    }
  }

  // --- Main invoke mock ---
  async function invoke(cmd, args, _options) {
    // Handle event plugin commands
    if (cmd === "plugin:event|listen") return handleListen(args);
    if (cmd === "plugin:event|emit") return handleEmit(args);
    if (cmd === "plugin:event|unlisten") return handleUnlisten(args);

    return handleCommand(cmd, args);
  }

  // --- Install on window ---
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
  window.__TAURI_INTERNALS__.invoke = invoke;
  window.__TAURI_INTERNALS__.transformCallback = registerCallback;
  window.__TAURI_INTERNALS__.unregisterCallback = unregisterCallback;
  window.__TAURI_INTERNALS__.runCallback = runCallback;
  window.__TAURI_INTERNALS__.callbacks = callbacks;
  window.__TAURI_INTERNALS__.metadata = {
    currentWindow: { label: "main" },
    currentWebview: { windowLabel: "main", label: "main" },
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function(event, id) {
    unregisterCallback(id);
  };
})();
`;
}

/**
 * Inject the Tauri mock layer into a Playwright page.
 * Must be called before page.goto().
 */
export async function injectTauriMock(page: Page, data: MockData): Promise<void> {
  await page.addInitScript({ content: buildInitScript(data) });
}
