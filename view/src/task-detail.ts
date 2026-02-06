import type { Project, Task, TaskStatus } from "./types.ts";

export interface TaskDetailCallbacks {
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onSimulate: (taskId: number) => void;
  onArchive: (taskId: number) => void;
  onNewTask: (projectId: number, name: string, description: string) => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function statusBadgeHtml(status: string): string {
  return `<span class="status-badge status-badge--${status}">${status}</span>`;
}

function renderNewTaskForm(
  container: HTMLElement,
  projects: Project[],
  callbacks: TaskDetailCallbacks,
): void {
  const projectOptionsHtml = projects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");

  container.innerHTML = `
    <div class="new-task-panel">
      <h2 class="new-task-panel-title">New Task</h2>
      <form class="new-task-panel-form" id="new-task-panel-form">
        <label class="form-label" for="ntp-name">Name</label>
        <input type="text" class="form-input" id="ntp-name" placeholder="Task name" required />

        <label class="form-label" for="ntp-project">Project</label>
        <select class="form-select" id="ntp-project">
          ${projectOptionsHtml}
        </select>

        <label class="form-label" for="ntp-description">Description <span class="form-optional">(optional)</span></label>
        <textarea class="form-textarea" id="ntp-description" placeholder="What needs to be done?" rows="4"></textarea>

        <button type="submit" class="btn btn-simulate" style="margin-top:0.5rem">Create Task</button>
      </form>
    </div>`;

  const form = container.querySelector("#new-task-panel-form") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (container.querySelector("#ntp-name") as HTMLInputElement).value.trim();
    const projectId = Number((container.querySelector("#ntp-project") as HTMLSelectElement).value);
    const description = (container.querySelector("#ntp-description") as HTMLTextAreaElement).value.trim();
    if (!name) return;
    callbacks.onNewTask(projectId, name, description);
  });
}

export function renderTaskDetail(
  container: HTMLElement,
  task: Task | null,
  projects: Project[],
  callbacks: TaskDetailCallbacks,
): void {
  if (!task) {
    renderNewTaskForm(container, projects, callbacks);
    return;
  }

  container.innerHTML = `
    <div class="task-detail">
      <div class="task-detail-header">
        <h2 class="task-detail-name">${escapeHtml(task.name)}</h2>
        ${statusBadgeHtml(task.status)}
      </div>

      ${task.description ? `<div class="task-detail-section"><h3>Description</h3><p>${escapeHtml(task.description)}</p></div>` : ""}
      ${task.summary ? `<div class="task-detail-section"><h3>Summary</h3><p>${escapeHtml(task.summary)}</p></div>` : ""}
      ${task.branch_name ? `<div class="task-detail-section"><h3>Branch</h3><p class="task-detail-mono">${escapeHtml(task.branch_name)}</p></div>` : ""}
      ${task.worktree_path ? `<div class="task-detail-section"><h3>Worktree</h3><p class="task-detail-mono">${escapeHtml(task.worktree_path)}</p></div>` : ""}

      <div class="task-detail-section">
        <h3>Iterations</h3>
        <p>${task.iteration_count}</p>
      </div>

      <div class="task-detail-section">
        <h3>Simulation</h3>
        <button class="btn btn-simulate" id="btn-simulate" ${task.status === "running" ? "disabled" : ""}>
          ${task.status === "running" ? "Running..." : "Start Simulation"}
        </button>
      </div>

      <div class="task-detail-section">
        <h3>Set Status</h3>
        <div class="status-buttons">
          <button class="btn btn-status" data-status="running" ${task.status === "running" ? "disabled" : ""}>Running</button>
          <button class="btn btn-status" data-status="waiting" ${task.status === "waiting" ? "disabled" : ""}>Waiting</button>
          <button class="btn btn-status" data-status="completed" ${task.status === "completed" ? "disabled" : ""}>Completed</button>
          <button class="btn btn-archive" id="btn-archive">Archive</button>
        </div>
      </div>
    </div>`;

  container.querySelector("#btn-simulate")?.addEventListener("click", () => {
    callbacks.onSimulate(task.id);
  });

  container.querySelectorAll(".btn-status").forEach((btn) => {
    btn.addEventListener("click", () => {
      const status = (btn as HTMLElement).dataset.status as TaskStatus;
      callbacks.onStatusChange(task.id, status);
    });
  });

  container.querySelector("#btn-archive")?.addEventListener("click", () => {
    callbacks.onArchive(task.id);
  });
}
