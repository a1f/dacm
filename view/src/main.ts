import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { renderSidebar, triggerRenameSelected } from "./sidebar.ts";
import { renderTaskDetail, destroyTerminalForSession, detachActiveTerminal } from "./task-detail.ts";
import { renderToolbar } from "./toolbar.ts";
import { clearStream, markStreamStarted, isSessionActive, hasReceivedOutput } from "./terminal.ts";
import { renderDebugPanel } from "./debug-panel.ts";
import { togglePerfOverlay } from "./perf-overlay.ts";
import { renderSettingsNav } from "./settings-nav.ts";
import { renderGeneralSettings } from "./settings-general.ts";
import { renderWorktreeSettings } from "./settings-worktrees.ts";
import { renderArchivedSettings } from "./settings-archived.ts";
import { initTheme } from "./theme.ts";
import { getSetting, setSetting } from "./settings-api.ts";
import type { Project, Task, TaskStatus, TaskStatusChangedEvent, SessionInfo, SettingsPage } from "./types.ts";
import { DEFAULT_CLI, DEFAULT_MODEL_ID } from "./constants.ts";
import { findModel } from "./utils.ts";
import "./style.css";

interface AppState {
  projects: Project[];
  tasks: Task[];
  selectedTaskId: number | null;
  selectedProjectId: number | null;
  selectedModelId: string;
  autoSpawning: boolean;
  activeSessions: Map<number, string>; // taskId -> sessionId
  sessionUnlisteners: Map<number, () => void>; // taskId -> unlisten function
  debugMode: boolean;
  sidebarCollapsed: boolean;
  view: "tasks" | "settings";
  settingsPage: SettingsPage;
}

const state: AppState = {
  projects: [],
  tasks: [],
  selectedTaskId: null,
  selectedProjectId: null,
  selectedModelId: DEFAULT_MODEL_ID,
  autoSpawning: false,
  activeSessions: new Map(),
  sessionUnlisteners: new Map(),
  debugMode: false,
  sidebarCollapsed: false,
  view: "tasks",
  settingsPage: "general",
};

const SIDEBAR_TOGGLE_ICON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="layout">
    <div class="titlebar-drag-region" data-tauri-drag-region></div>
    <aside class="sidebar" id="sidebar"></aside>
    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" title="Toggle sidebar (Cmd+B)">
      ${SIDEBAR_TOGGLE_ICON}
    </button>
    <main class="main-content" id="main-content"></main>
  </div>
`;

const sidebarEl = document.querySelector<HTMLElement>("#sidebar")!;
const mainContentEl = document.querySelector<HTMLElement>("#main-content")!;
const sidebarToggleBtn = document.querySelector<HTMLElement>("#sidebar-toggle-btn")!;

function getSelectedTask(): Task | null {
  if (state.selectedTaskId === null) return null;
  return state.tasks.find((t) => t.id === state.selectedTaskId) ?? null;
}

function getProjectPath(projectId: number): string | null {
  const project = state.projects.find((p) => p.id === projectId);
  return project?.path ?? null;
}

function toggleSidebar(): void {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  sidebarEl.classList.toggle("sidebar--collapsed", state.sidebarCollapsed);
  sidebarToggleBtn.classList.toggle("sidebar-toggle-btn--visible", state.sidebarCollapsed);
}

async function handleModelChange(modelId: string): Promise<void> {
  state.selectedModelId = modelId;
  setSetting("selected_model_id", modelId);

  if (state.selectedTaskId !== null) {
    const task = getSelectedTask();
    if (task) {
      const sessionId = state.activeSessions.get(task.id);
      if (sessionId) {
        // Kill old session inline (skip status change to "waiting" — we're restarting)
        try { await invoke("kill_session", { sessionId }); } catch {}
        const unlisten = state.sessionUnlisteners.get(task.id);
        if (unlisten) { unlisten(); state.sessionUnlisteners.delete(task.id); }
        destroyTerminalForSession(sessionId);
        state.activeSessions.delete(task.id);
        clearStream(sessionId);
      }
      // Respawn session for the SAME task with new model (no intermediate render)
      await spawnSessionForTask(task);
      render();
      return;
    }
  }
  render();
}

async function handleProjectChange(newProjectId: number): Promise<void> {
  if (newProjectId === state.selectedProjectId && state.selectedTaskId !== null) return;

  state.autoSpawning = false;
  if (state.selectedTaskId !== null) {
    await killSessionForTask(state.selectedTaskId);
  }
  state.selectedProjectId = newProjectId;

  // Select the most recent running task in the target project, or the most recent task overall
  const projectTasks = state.tasks.filter((t) => t.project_id === newProjectId);
  const running = projectTasks.find((t) => t.status === "running");
  const best = running ?? projectTasks[0] ?? null;
  state.selectedTaskId = best?.id ?? null;

  setSetting("last_project_id", String(newProjectId));
  render();
}

async function autoSpawnNewTask(projectId: number): Promise<void> {
  if (state.autoSpawning) return;

  state.autoSpawning = true;
  state.selectedProjectId = projectId;
  state.selectedTaskId = null;
  render(); // shows "Starting session…"

  try {
    const now = new Date();
    const name = `Chat ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

    const newTask = await invoke<Task>("create_task", {
      projectId,
      name,
      description: "",
    });
    if (!state.autoSpawning) return;
    state.tasks.push(newTask);
    state.selectedTaskId = newTask.id;
    state.selectedProjectId = projectId;
    setSetting("last_task_id", String(newTask.id));
    render();
    if (!state.autoSpawning) return;
    await spawnSessionForTask(newTask);
    render();
  } catch (e) {
    console.error("Failed to auto-spawn session:", e);
  } finally {
    state.autoSpawning = false;
  }
}

async function spawnSessionForTask(task: Task): Promise<void> {
  const path = getProjectPath(task.project_id);
  if (!path) return;

  try {
    const model = findModel(state.selectedModelId);
    const cliCommand = model?.interface ?? DEFAULT_CLI;

    const sessionId = await invoke<string>("spawn_session", {
      taskId: task.id,
      projectId: task.project_id,
      workingDir: path,
      initialPrompt: task.description || null,
      cliCommand,
      model: state.selectedModelId,
    });
    state.activeSessions.set(task.id, sessionId);

    // When this session exits, clean up and archive the task
    const unlisten = await listen<void>(`session-exit-${sessionId}`, async () => {
      // Deregister this listener
      const unsub = state.sessionUnlisteners.get(task.id);
      if (unsub) { unsub(); state.sessionUnlisteners.delete(task.id); }

      // Destroy terminal to free xterm.js memory
      destroyTerminalForSession(sessionId);
      state.activeSessions.delete(task.id);
      clearStream(sessionId);

      try {
        await invoke<Task>("archive_task", { taskId: task.id });
      } catch (_e) {
        // Task may have been archived already
      }
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      if (state.selectedTaskId === task.id) {
        const siblings = state.tasks.filter((t) => t.project_id === task.project_id);
        state.selectedTaskId = siblings[0]?.id ?? null;
      }
      render();
    });
    state.sessionUnlisteners.set(task.id, unlisten);

    if (task.status !== "running") {
      const updated = await invoke<Task>("update_task_status", {
        taskId: task.id,
        status: "running",
      });
      state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
    }
  } catch (e) {
    console.error("Failed to spawn session:", e);
  }
}

async function killSessionForTask(taskId: number): Promise<void> {
  const sessionId = state.activeSessions.get(taskId);
  if (!sessionId) return;

  try {
    await invoke("kill_session", { sessionId });
  } catch (e) {
    console.error("Failed to kill session:", e);
  }

  // Clean up the exit listener
  const unlisten = state.sessionUnlisteners.get(taskId);
  if (unlisten) {
    unlisten();
    state.sessionUnlisteners.delete(taskId);
  }

  destroyTerminalForSession(sessionId);
  state.activeSessions.delete(taskId);
  clearStream(sessionId);

  // Archive the task so it disappears from the sidebar and debug panel
  const archivedProjectId = state.tasks.find((t) => t.id === taskId)?.project_id;
  try {
    await invoke<Task>("archive_task", { taskId });
  } catch (e) {
    console.error("Failed to archive task:", e);
  }
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  if (state.selectedTaskId === taskId) {
    const siblings = archivedProjectId
      ? state.tasks.filter((t) => t.project_id === archivedProjectId)
      : [];
    state.selectedTaskId = siblings[0]?.id ?? null;
  }
}

function renderSettingsView(): void {
  renderSettingsNav(sidebarEl, state.settingsPage, {
    onBack() {
      state.view = "tasks";
      render();
    },
    onPageSelect(page: SettingsPage) {
      state.settingsPage = page;
      render();
    },
  });

  detachActiveTerminal(mainContentEl);
  mainContentEl.classList.remove("terminal-mode");

  switch (state.settingsPage) {
    case "general":
      renderGeneralSettings(mainContentEl, {
        async onPreventSleepChange(prevent: boolean) {
          try {
            await invoke("set_prevent_sleep", { prevent });
          } catch (e) {
            console.error("Failed to set prevent sleep:", e);
          }
        },
      });
      break;
    case "worktrees":
      renderWorktreeSettings(mainContentEl);
      break;
    case "archived":
      renderArchivedSettings(mainContentEl, state.projects, {
        async onRestore(taskId: number) {
          try {
            const updated = await invoke<Task>("update_task_status", { taskId, status: "waiting" });
            state.tasks.push(updated);
            render();
          } catch (e) {
            console.error("Failed to restore task:", e);
          }
        },
        async onDelete(taskId: number) {
          try {
            await invoke("delete_task", { taskId });
            render();
          } catch (e) {
            console.error("Failed to delete task:", e);
          }
        },
      });
      break;
  }
}

function getSidebarCallbacks(): import("./sidebar.ts").SidebarCallbacks {
  return {
    onTaskSelect(taskId: number) {
      state.selectedTaskId = taskId;
      state.debugMode = false;
      setSetting("last_task_id", String(taskId));
      render();
    },
    async onRenameTask(taskId: number, name: string) {
      try {
        const updated = await invoke<Task>("rename_task", { taskId, name });
        state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
        render();
      } catch (e) {
        console.error("Failed to rename task:", e);
      }
    },
    async onNewThread() {
      state.debugMode = false;
      const projectId = state.selectedProjectId ?? state.projects[0]?.id;
      if (projectId) {
        await autoSpawnNewTask(projectId);
      }
    },
    async onNewTaskForProject(projectId: number) {
      if (state.selectedTaskId !== null && projectId !== state.selectedProjectId) {
        await killSessionForTask(state.selectedTaskId);
      }
      state.debugMode = false;
      setSetting("last_project_id", String(projectId));
      await autoSpawnNewTask(projectId);
    },
    async onAddProject() {
      try {
        const selected = await open({ directory: true, multiple: false });
        if (!selected) return;
        await invoke("add_project", { path: selected });
        await refresh();
      } catch (e) {
        console.error("Failed to add project:", e);
      }
    },
    async onArchiveTask(taskId: number) {
      try {
        await invoke<Task>("archive_task", { taskId });
        const unlisten = state.sessionUnlisteners.get(taskId);
        if (unlisten) { unlisten(); state.sessionUnlisteners.delete(taskId); }
        const sessionId = state.activeSessions.get(taskId);
        if (sessionId) {
          destroyTerminalForSession(sessionId);
          clearStream(sessionId);
        }
        state.activeSessions.delete(taskId);
        const archivedProjectId = state.tasks.find((t) => t.id === taskId)?.project_id;
        state.tasks = state.tasks.filter((t) => t.id !== taskId);
        if (state.selectedTaskId === taskId) {
          // Select next task in same project, or null
          const siblings = archivedProjectId
            ? state.tasks.filter((t) => t.project_id === archivedProjectId)
            : [];
          state.selectedTaskId = siblings[0]?.id ?? null;
        }
        render();
      } catch (e) {
        console.error("Failed to archive task:", e);
      }
    },
    onToggleSidebar() {
      toggleSidebar();
    },
    onOpenSettings() {
      state.view = "settings";
      state.debugMode = false;
      render();
    },
    async onRemoveProject(projectId: number) {
      try {
        await invoke("remove_project", { id: projectId });
        state.tasks = state.tasks.filter((t) => t.project_id !== projectId);
        if (state.selectedTaskId !== null) {
          const selected = state.tasks.find((t) => t.id === state.selectedTaskId);
          if (!selected) state.selectedTaskId = null;
        }
        await refresh();
      } catch (e) {
        console.error("Failed to remove project:", e);
      }
    },
  };
}

function refreshSidebar(): void {
  renderSidebar(sidebarEl, state.projects, state.tasks, state.selectedTaskId, getSidebarCallbacks());
}

function render() {
  if (state.view === "settings") {
    renderSettingsView();
    return;
  }

  refreshSidebar();

  if (state.debugMode) {
    mainContentEl.classList.remove("terminal-mode");
    detachActiveTerminal(mainContentEl);
    renderDebugPanel(mainContentEl, state.tasks, {
      onClose() {
        state.debugMode = false;
        render();
      },
      onGoToTask(taskId: number) {
        state.selectedTaskId = taskId;
        state.debugMode = false;
        render();
      },
      async onKillSession(sessionId: string) {
        let targetTaskId: number | null = null;
        for (const [taskId, sid] of state.activeSessions) {
          if (sid === sessionId) {
            targetTaskId = taskId;
            break;
          }
        }
        if (targetTaskId !== null) {
          await killSessionForTask(targetTaskId);
        }
        render();
      },
    });
    return;
  }

  const task = getSelectedTask();

  if (!task) {
    detachActiveTerminal(mainContentEl);
    mainContentEl.classList.add("terminal-mode");

    // No projects — prompt user to add one
    if (state.projects.length === 0) {
      mainContentEl.innerHTML = `
        <div class="session-header" data-tauri-drag-region></div>
        <div class="no-session-body">
          <div class="no-session-message">
            <span class="no-session-label">No projects configured</span>
            <button class="btn btn-restart" id="btn-add-project">Add a project</button>
          </div>
        </div>`;
      mainContentEl.querySelector("#btn-add-project")?.addEventListener("click", async () => {
        try {
          const selected = await open({ directory: true, multiple: false });
          if (!selected) return;
          await invoke("add_project", { path: selected });
          await refresh();
        } catch (e) {
          console.error("Failed to add project:", e);
        }
      });
      renderToolbar(mainContentEl, {
        selectedModelId: state.selectedModelId,
        selectedProject: null,
        projects: [],
        branchName: null,
      }, {
        async onModelChange(modelId: string) {
          await handleModelChange(modelId);
        },
        async onProjectChange() {},
        async onAddProject() {
          try {
            const selected = await open({ directory: true, multiple: false });
            if (!selected) return;
            await invoke("add_project", { path: selected });
            await refresh();
          } catch (e) {
            console.error("Failed to add project:", e);
          }
        },
      });
      return;
    }

    // Currently auto-spawning — show loading state
    if (state.autoSpawning) {
      const selectedProject = state.projects.find((p) => p.id === state.selectedProjectId) ?? null;
      mainContentEl.innerHTML = `
        <div class="session-header" data-tauri-drag-region>
          <span class="session-header-title">Starting session\u2026</span>
        </div>
        <div class="no-session-body">
          <div class="no-session-message">
            <span class="no-session-label">Starting session\u2026</span>
          </div>
        </div>`;
      renderToolbar(mainContentEl, {
        selectedModelId: state.selectedModelId,
        selectedProject,
        projects: state.projects,
        branchName: null,
      }, {
        async onModelChange(modelId: string) {
          await handleModelChange(modelId);
        },
        async onProjectChange(newProjectId: number) {
          await handleProjectChange(newProjectId);
        },
        async onAddProject() {
          try {
            const selected = await open({ directory: true, multiple: false });
            if (!selected) return;
            await invoke("add_project", { path: selected });
            await refresh();
          } catch (e) {
            console.error("Failed to add project:", e);
          }
        },
      });
      return;
    }

    // No task selected — show empty state (no auto-spawn)
    const projectId = state.selectedProjectId ?? state.projects[0]?.id;
    const selectedProject = projectId ? state.projects.find((p) => p.id === projectId) ?? null : null;
    mainContentEl.innerHTML = `
      <div class="session-header" data-tauri-drag-region></div>
      <div class="no-session-body">
        <div class="no-session-message">
          <span class="no-session-label">No active session</span>
          <button class="btn btn-restart" id="btn-new-session">New session</button>
        </div>
      </div>`;
    mainContentEl.querySelector("#btn-new-session")?.addEventListener("click", async () => {
      const pid = state.selectedProjectId ?? state.projects[0]?.id;
      if (pid) await autoSpawnNewTask(pid);
    });
    renderToolbar(mainContentEl, {
      selectedModelId: state.selectedModelId,
      selectedProject,
      projects: state.projects,
      branchName: null,
    }, {
      async onModelChange(modelId: string) {
        await handleModelChange(modelId);
      },
      async onProjectChange(newProjectId: number) {
        await handleProjectChange(newProjectId);
      },
      async onAddProject() {
        try {
          const selected = await open({ directory: true, multiple: false });
          if (!selected) return;
          await invoke("add_project", { path: selected });
          await refresh();
        } catch (e) {
          console.error("Failed to add project:", e);
        }
      },
    });
    return;
  }

  const activeSessionId = state.activeSessions.get(task.id) ?? null;
  const selectedProject = state.projects.find((p) => p.id === task.project_id) ?? null;
  const toolbarProps = {
    selectedModelId: state.selectedModelId,
    selectedProject,
    projects: state.projects,
    branchName: task.branch_name,
  };

  renderTaskDetail(mainContentEl, task, activeSessionId, toolbarProps, {
    async onStatusChange(taskId: number, status: TaskStatus) {
      try {
        const updated = await invoke<Task>("update_task_status", { taskId, status });
        state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
        render();
      } catch (e) {
        console.error("Failed to update status:", e);
      }
    },
    async onSimulate(taskId: number) {
      try {
        await invoke("simulate_task", { taskId });
      } catch (e) {
        console.error("Failed to start simulation:", e);
      }
    },
    async onArchive(taskId: number) {
      try {
        await invoke<Task>("archive_task", { taskId });
        const unlisten = state.sessionUnlisteners.get(taskId);
        if (unlisten) {
          unlisten();
          state.sessionUnlisteners.delete(taskId);
        }
        const sessionId = state.activeSessions.get(taskId);
        if (sessionId) {
          destroyTerminalForSession(sessionId);
          clearStream(sessionId);
        }
        state.activeSessions.delete(taskId);
        const archivedProjectId = state.tasks.find((t) => t.id === taskId)?.project_id;
        state.tasks = state.tasks.filter((t) => t.id !== taskId);
        if (state.selectedTaskId === taskId) {
          const siblings = archivedProjectId
            ? state.tasks.filter((t) => t.project_id === archivedProjectId)
            : [];
          state.selectedTaskId = siblings[0]?.id ?? null;
        }
        render();
      } catch (e) {
        console.error("Failed to archive task:", e);
      }
    },
    async onKillSession(taskId: number) {
      await killSessionForTask(taskId);
      render();
    },
    async onRestartSession(taskId: number) {
      const oldSessionId = state.activeSessions.get(taskId);
      if (oldSessionId) {
        destroyTerminalForSession(oldSessionId);
        state.activeSessions.delete(taskId);
        clearStream(oldSessionId);
      }
      const t = state.tasks.find((t) => t.id === taskId);
      if (t) {
        await spawnSessionForTask(t);
        render();
      }
    },
    async onModelChange(modelId: string) {
      await handleModelChange(modelId);
    },
    async onProjectChange(projectId: number) {
      await handleProjectChange(projectId);
    },
    async onAddProject() {
      try {
        const selected = await open({ directory: true, multiple: false });
        if (!selected) return;
        await invoke("add_project", { path: selected });
        await refresh();
      } catch (e) {
        console.error("Failed to add project:", e);
      }
    },
  });
}

async function loadCodeFontSettings(): Promise<void> {
  try {
    const family = await getSetting("code_font_family");
    if (family) document.documentElement.style.setProperty("--code-font-family", family);
  } catch { /* use default */ }
  try {
    const size = await getSetting("code_font_size");
    if (size) document.documentElement.style.setProperty("--code-font-size", size + "px");
  } catch { /* use default */ }
}

async function refresh() {
  try {
    const [projects, tasks, sessions] = await Promise.all([
      invoke<Project[]>("list_projects"),
      invoke<Task[]>("list_all_tasks"),
      invoke<SessionInfo[]>("list_sessions"),
    ]);
    state.projects = projects;
    state.tasks = tasks;

    const runningSessionTaskIds = new Set(
      sessions.filter((s) => s.status === "running").map((s) => s.task_id),
    );

    for (const s of sessions) {
      if (s.status === "running" && !state.activeSessions.has(s.task_id)) {
        state.activeSessions.set(s.task_id, s.session_id);
        markStreamStarted(s.session_id);
      }
    }

    // Reconcile stale "running" tasks: if no backend session exists, mark completed
    for (const task of state.tasks) {
      if (task.status === "running" && !runningSessionTaskIds.has(task.id)) {
        try {
          const updated = await invoke<Task>("update_task_status", {
            taskId: task.id,
            status: "completed",
          });
          state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
        } catch { /* ignore */ }
      }
    }

    render();
  } catch (e) {
    console.error("Failed to load data:", e);
  }
}

listen<TaskStatusChangedEvent>("task-status-changed", (event) => {
  const { task_id, status } = event.payload;
  state.tasks = state.tasks.map((t) =>
    t.id === task_id ? { ...t, status } : t,
  );
  render();
});

// Centralized keyboard shortcuts — skip when terminal is focused
document.addEventListener("keydown", (e) => {
  const inTerminal = document.activeElement?.closest(".terminal-container") !== null;

  // Ctrl+Shift+D — debug panel (always active)
  if (e.ctrlKey && e.shiftKey && e.key === "D") {
    e.preventDefault();
    state.debugMode = !state.debugMode;
    render();
    return;
  }

  // Ctrl+Shift+P — performance overlay (always active)
  if (e.ctrlKey && e.shiftKey && e.key === "P") {
    e.preventDefault();
    togglePerfOverlay();
    return;
  }

  const mod = e.metaKey || e.ctrlKey;

  // Cmd+E — rename selected task (always active)
  if (mod && e.key === "e") {
    e.preventDefault();
    triggerRenameSelected(sidebarEl, state.selectedTaskId, getSidebarCallbacks());
    return;
  }

  // Skip remaining shortcuts when terminal has focus
  if (inTerminal) return;

  // Cmd+B — toggle sidebar
  if (mod && e.key === "b") {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // Cmd+, — toggle settings
  if (mod && e.key === ",") {
    e.preventDefault();
    if (state.view === "settings") {
      state.view = "tasks";
    } else {
      state.view = "settings";
      state.debugMode = false;
    }
    render();
    return;
  }

  // Cmd+N — new session
  if (mod && e.key === "n") {
    e.preventDefault();
    state.debugMode = false;
    if (state.view === "settings") {
      state.view = "tasks";
    }
    const pid = state.selectedProjectId ?? state.projects[0]?.id;
    if (pid) autoSpawnNewTask(pid);
    return;
  }

  // Escape — close settings, deselect task, or close debug
  if (e.key === "Escape") {
    if (state.view === "settings") {
      e.preventDefault();
      state.view = "tasks";
      render();
      return;
    }
    if (state.debugMode) {
      e.preventDefault();
      state.debugMode = false;
      render();
      return;
    }
    if (state.selectedTaskId !== null) {
      e.preventDefault();
      state.selectedTaskId = null;
      render();
      return;
    }
  }
});

// Sidebar toggle button click
sidebarToggleBtn.addEventListener("click", toggleSidebar);

async function loadPersistedState(): Promise<void> {
  try {
    const projectId = await getSetting("last_project_id");
    const id = Number(projectId);
    if (state.projects.some((p) => p.id === id)) {
      state.selectedProjectId = id;
    }
  } catch { /* no persisted project */ }

  try {
    const modelId = await getSetting("selected_model_id");
    if (findModel(modelId)) {
      state.selectedModelId = modelId;
    }
  } catch { /* no persisted model */ }

  try {
    const taskId = await getSetting("last_task_id");
    const id = Number(taskId);
    if (state.tasks.some((t) => t.id === id)) {
      state.selectedTaskId = id;
    }
  } catch { /* no persisted task */ }

  if (state.selectedProjectId === null && state.projects.length > 0) {
    state.selectedProjectId = state.projects[0].id;
  }
}

// Idle detection: mark running tasks as completed when PTY output stops,
// and mark them running again when output resumes.
const IDLE_THRESHOLD_MS = 5000;
setInterval(() => {
  for (const [taskId, sessionId] of state.activeSessions) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) continue;

    const active = isSessionActive(sessionId, IDLE_THRESHOLD_MS);
    const received = hasReceivedOutput(sessionId);

    if (task.status === "running" && !active && received) {
      // Idle for 5s after receiving output — mark completed
      invoke<Task>("update_task_status", { taskId, status: "completed" })
        .then((updated) => {
          state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
          refreshSidebar();
        })
        .catch(() => {});
    } else if (task.status === "completed" && active) {
      // Output resumed — mark running
      invoke<Task>("update_task_status", { taskId, status: "running" })
        .then((updated) => {
          state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
          refreshSidebar();
        })
        .catch(() => {});
    }
  }
}, 3000);

async function init(): Promise<void> {
  await initTheme();
  await Promise.all([refresh(), loadCodeFontSettings()]);
  await loadPersistedState();

  if (state.selectedTaskId === null && state.projects.length > 0) {
    const projectId = state.selectedProjectId ?? state.projects[0].id;

    // Prefer selecting an existing task (handles page reload / HMR)
    const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
    const running = projectTasks.find((t) => t.status === "running");
    const best = running ?? projectTasks[0] ?? null;

    if (best) {
      state.selectedTaskId = best.id;
      setSetting("last_task_id", String(best.id));
      render();
    } else {
      await autoSpawnNewTask(projectId);
    }
  } else {
    render();
  }
}

init();
