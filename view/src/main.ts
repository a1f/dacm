import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { renderSidebar } from "./sidebar.ts";
import { renderStartPage } from "./start-page.ts";
import { renderTaskDetail, destroyActiveTerminal, destroyTerminalForSession, detachActiveTerminal } from "./task-detail.ts";
import { clearStream, markStreamStarted } from "./terminal.ts";
import { renderDebugPanel } from "./debug-panel.ts";
import { renderSettingsNav } from "./settings-nav.ts";
import { renderGeneralSettings } from "./settings-general.ts";
import { renderWorktreeSettings } from "./settings-worktrees.ts";
import { renderArchivedSettings } from "./settings-archived.ts";
import { initTheme } from "./theme.ts";
import type { Project, Task, TaskStatus, TaskStatusChangedEvent, SessionInfo, SettingsPage } from "./types.ts";
import "./style.css";

interface AppState {
  projects: Project[];
  tasks: Task[];
  selectedTaskId: number | null;
  selectedProjectId: number | null;
  activeSessions: Map<number, string>; // taskId -> sessionId
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
  activeSessions: new Map(),
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

async function spawnSessionForTask(task: Task): Promise<void> {
  const path = getProjectPath(task.project_id);
  if (!path) return;

  try {
    const sessionId = await invoke<string>("spawn_session", {
      taskId: task.id,
      projectId: task.project_id,
      workingDir: path,
      initialPrompt: task.description || null,
    });
    state.activeSessions.set(task.id, sessionId);

    // When this session exits, update task status and clean up
    listen<void>(`session-exit-${sessionId}`, async () => {
      state.activeSessions.delete(task.id);
      clearStream(sessionId);
      try {
        const updated = await invoke<Task>("update_task_status", {
          taskId: task.id,
          status: "completed",
        });
        state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
      } catch (_e) {
        // Task may have been archived already
      }
      render();
    });

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

  destroyTerminalForSession(sessionId);
  state.activeSessions.delete(taskId);
  clearStream(sessionId);

  try {
    const updated = await invoke<Task>("update_task_status", {
      taskId,
      status: "waiting",
    });
    state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
  } catch (e) {
    console.error("Failed to update task status:", e);
  }

  render();
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

function render() {
  if (state.view === "settings") {
    renderSettingsView();
    return;
  }

  renderSidebar(sidebarEl, state.projects, state.tasks, state.selectedTaskId, {
    onTaskSelect(taskId: number) {
      state.selectedTaskId = taskId;
      state.debugMode = false;
      render();
    },
    onNewThread() {
      state.selectedTaskId = null;
      state.debugMode = false;
      render();
    },
    onNewTaskForProject(projectId: number) {
      state.selectedTaskId = null;
      state.selectedProjectId = projectId;
      state.debugMode = false;
      render();
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
  });

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
        try {
          await invoke("kill_session", { sessionId });
        } catch (e) {
          console.error("Failed to kill session:", e);
        }
        for (const [taskId, sid] of state.activeSessions) {
          if (sid === sessionId) {
            state.activeSessions.delete(taskId);
            break;
          }
        }
        render();
      },
    });
    return;
  }

  const task = getSelectedTask();

  if (!task) {
    detachActiveTerminal(mainContentEl);
    mainContentEl.classList.remove("terminal-mode");
    renderStartPage(mainContentEl, state.projects, state.selectedProjectId, {
      async onPromptSubmit(projectId: number, prompt: string) {
        const name = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
        try {
          const task = await invoke<Task>("create_task", {
            projectId,
            name,
            description: prompt,
          });
          state.tasks.push(task);
          state.selectedTaskId = task.id;
          render();
          await spawnSessionForTask(task);
          render();
        } catch (e) {
          console.error("Failed to create task:", e);
        }
      },
      onProjectSelect(projectId: number) {
        state.selectedProjectId = projectId;
        render();
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

  renderTaskDetail(mainContentEl, task, activeSessionId, {
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
        state.activeSessions.delete(taskId);
        destroyActiveTerminal();
        state.tasks = state.tasks.filter((t) => t.id !== taskId);
        if (state.selectedTaskId === taskId) {
          state.selectedTaskId = null;
        }
        render();
      } catch (e) {
        console.error("Failed to archive task:", e);
      }
    },
    async onKillSession(taskId: number) {
      await killSessionForTask(taskId);
    },
  });
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
    for (const s of sessions) {
      if (s.status === "running" && !state.activeSessions.has(s.task_id)) {
        state.activeSessions.set(s.task_id, s.session_id);
        markStreamStarted(s.session_id);
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

// Ctrl+Shift+D toggles debug panel
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "D") {
    e.preventDefault();
    state.debugMode = !state.debugMode;
    render();
  }
});

// Cmd+B (Mac) / Ctrl+B (Win/Linux) toggles sidebar
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "b") {
    e.preventDefault();
    toggleSidebar();
  }
});

// Cmd+, (Mac) / Ctrl+, (Win/Linux) opens settings
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === ",") {
    e.preventDefault();
    if (state.view === "settings") {
      state.view = "tasks";
    } else {
      state.view = "settings";
      state.debugMode = false;
    }
    render();
  }
});

// Sidebar toggle button click
sidebarToggleBtn.addEventListener("click", toggleSidebar);

initTheme().then(() => refresh());
