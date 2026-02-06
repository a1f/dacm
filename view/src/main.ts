import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { renderSidebar } from "./sidebar.ts";
import { renderTaskDetail } from "./task-detail.ts";
import type { Project, Task, TaskStatus, TaskStatusChangedEvent } from "./types.ts";
import "./style.css";

interface AppState {
  projects: Project[];
  tasks: Task[];
  selectedTaskId: number | null;
}

const state: AppState = {
  projects: [],
  tasks: [],
  selectedTaskId: null,
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

function render() {
  renderSidebar(sidebarEl, state.projects, state.tasks, state.selectedTaskId, {
    onTaskSelect(taskId: number) {
      state.selectedTaskId = taskId;
      render();
    },
    async onQuickTask(projectId: number, name: string) {
      try {
        const task = await invoke<Task>("create_task", { projectId, name });
        state.tasks.push(task);
        state.selectedTaskId = task.id;
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
        // Remove tasks belonging to this project from local state
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

  renderTaskDetail(mainContentEl, getSelectedTask(), state.projects, {
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
      } catch (e) {
        console.error("Failed to create task:", e);
      }
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

refresh();
