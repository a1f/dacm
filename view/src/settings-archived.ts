import { invoke } from "@tauri-apps/api/core";
import type { Project, Task } from "./types.ts";

export interface ArchivedSettingsCallbacks {
  onRestore: (taskId: number) => void;
  onDelete: (taskId: number) => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export async function renderArchivedSettings(
  container: HTMLElement,
  projects: Project[],
  callbacks: ArchivedSettingsCallbacks,
): Promise<void> {
  let archivedTasks: Task[];
  try {
    archivedTasks = await invoke<Task[]>("list_archived_tasks");
  } catch {
    archivedTasks = [];
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const listHtml =
    archivedTasks.length === 0
      ? `<p class="archived-empty">No archived tasks.</p>`
      : archivedTasks
          .map((task) => {
            const project = projectMap.get(task.project_id);
            const projectName = project ? escapeHtml(project.name) : "Unknown";
            const date = new Date(task.created_at).toLocaleDateString();
            return `
              <div class="archived-task-row" data-task-id="${task.id}">
                <div class="archived-task-info">
                  <div class="archived-task-name">${escapeHtml(task.name)}</div>
                  <div class="archived-task-meta">${projectName} &middot; ${date}</div>
                </div>
                <div class="archived-task-actions">
                  <button class="btn" data-action="restore" data-task-id="${task.id}">Restore</button>
                  <button class="btn btn-archive" data-action="delete" data-task-id="${task.id}">Delete</button>
                </div>
              </div>`;
          })
          .join("");

  container.innerHTML = `
    <div class="settings-page">
      <h2 class="settings-page-title">Archived</h2>
      <div class="archived-task-list">
        ${listHtml}
      </div>
    </div>`;

  container.querySelectorAll("[data-action='restore']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const taskId = Number((btn as HTMLElement).dataset.taskId);
      callbacks.onRestore(taskId);
    });
  });

  container.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const taskId = Number((btn as HTMLElement).dataset.taskId);
      if (confirm("Permanently delete this task?")) {
        callbacks.onDelete(taskId);
      }
    });
  });
}
