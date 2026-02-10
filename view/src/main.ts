import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { renderSidebar } from "./sidebar.ts";
import { renderTaskDetail, destroyActiveTerminal, destroyTerminalForSession, detachActiveTerminal } from "./task-detail.ts";
import { clearStream } from "./terminal.ts";
import { renderDebugPanel } from "./debug-panel.ts";
import type { Project, Task, TaskStatus, TaskStatusChangedEvent } from "./types.ts";
import "./style.css";

interface AppState {
  projects: Project[];
  tasks: Task[];
  selectedTaskId: number | null;
  activeSessions: Map<number, string>; // taskId -> sessionId
  debugMode: boolean;
}

const state: AppState = {
  projects: [],
  tasks: [],
  selectedTaskId: null,
  activeSessions: new Map(),
  debugMode: false,
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="layout">
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main-content" id="main-content"></main>
  </div>
`;

const sidebarEl = document.querySelector<HTMLElement>("#sidebar")!;
const mainContentEl = document.querySelector<HTMLElement>("#main-content")!;

function getSelectedTask(): Task | null {
  if (state.selectedTaskId === null) return null;
  return state.tasks.find((t) => t.id === state.selectedTaskId) ?? null;
}

function getProjectPath(projectId: number): string | null {
  const project = state.projects.find((p) => p.id === projectId);
  return project?.path ?? null;
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

function render() {
  renderSidebar(sidebarEl, state.projects, state.tasks, state.selectedTaskId, {
    onTaskSelect(taskId: number) {
      state.selectedTaskId = taskId;
      state.debugMode = false;
      render();
    },
    async onQuickTask(projectId: number, name: string) {
      try {
        const task = await invoke<Task>("create_task", { projectId, name });
        state.tasks.push(task);
        state.selectedTaskId = task.id;
        render();
        await spawnSessionForTask(task);
        render();
      } catch (e) {
        console.error("Failed to create task:", e);
      }
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
    renderDebugPanel(mainContentEl, {
      onClose() {
        state.debugMode = false;
        render();
      },
      async onKillSession(sessionId: string) {
        try {
          await invoke("kill_session", { sessionId });
        } catch (e) {
          console.error("Failed to kill session:", e);
        }
        // Remove from activeSessions map
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
  const activeSessionId = task ? (state.activeSessions.get(task.id) ?? null) : null;

  renderTaskDetail(mainContentEl, task, state.projects, activeSessionId, {
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
    async onNewTask(projectId: number, name: string, description: string) {
      try {
        const task = await invoke<Task>("create_task", {
          projectId,
          name,
          description: description || null,
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
    async onKillSession(taskId: number) {
      await killSessionForTask(taskId);
    },
  });
}

async function refresh() {
  try {
    const [projects, tasks] = await Promise.all([
      invoke<Project[]>("list_projects"),
      invoke<Task[]>("list_all_tasks"),
    ]);
    state.projects = projects;
    state.tasks = tasks;
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

refresh();
