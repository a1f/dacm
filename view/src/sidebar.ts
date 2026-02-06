import type { Project, Task } from "./types.ts";

export interface SidebarCallbacks {
  onTaskSelect: (taskId: number) => void;
  onQuickTask: (projectId: number, name: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: number) => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function statusIndicatorHtml(status: string): string {
  switch (status) {
    case "running":
      return `<span class="status-indicator status-running" title="Running"></span>`;
    case "waiting":
      return `<span class="status-indicator status-waiting" title="Waiting">?</span>`;
    case "completed":
      return `<span class="status-indicator status-completed" title="Completed"></span>`;
    default:
      return "";
  }
}

export function renderSidebar(
  container: HTMLElement,
  projects: Project[],
  tasks: Task[],
  selectedTaskId: number | null,
  callbacks: SidebarCallbacks,
): void {
  const tasksByProject = new Map<number, Task[]>();
  for (const task of tasks) {
    const list = tasksByProject.get(task.project_id) ?? [];
    list.push(task);
    tasksByProject.set(task.project_id, list);
  }

  const statusOrder: Record<string, number> = { waiting: 0, running: 1, completed: 2 };
  for (const [projectId, projectTasks] of tasksByProject) {
    projectTasks.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
    tasksByProject.set(projectId, projectTasks);
  }

  const projectGroupsHtml = projects
    .map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const tasksHtml = projectTasks
        .map(
          (task) => `
          <div class="task-row ${task.id === selectedTaskId ? "task-row--selected" : ""}" data-task-id="${task.id}">
            ${statusIndicatorHtml(task.status)}
            <span class="task-name">${escapeHtml(task.name)}</span>
          </div>`,
        )
        .join("");

      return `
        <div class="project-group">
          <div class="project-group-header">
            <span class="project-group-name">${escapeHtml(project.name)}</span>
            <button class="project-add-btn" data-project-id="${project.id}" title="New task">+</button>
          </div>
          <div class="project-inline-form hidden" data-form-project-id="${project.id}">
            <input type="text" class="inline-task-input" placeholder="Task name" data-input-project-id="${project.id}" />
          </div>
          ${tasksHtml}
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="sidebar-header">
      <h2 class="sidebar-title">DACM</h2>
      <button class="hamburger-btn" id="hamburger-btn" title="Project menu">&#8801;</button>
      <div class="menu-dropdown hidden" id="menu-dropdown">
        <button class="menu-item" id="menu-add-project">Add Project</button>
        ${projects.length > 0 ? `<div class="menu-separator"></div>` : ""}
        ${projects
          .map(
            (p) => `
            <button class="menu-item menu-item--delete" data-remove-project-id="${p.id}">
              Remove ${escapeHtml(p.name)}
            </button>`,
          )
          .join("")}
      </div>
    </div>
    <div class="sidebar-projects">
      ${projectGroupsHtml}
    </div>`;

  // Hamburger menu toggle
  const hamburgerBtn = container.querySelector("#hamburger-btn") as HTMLButtonElement;
  const menuDropdown = container.querySelector("#menu-dropdown") as HTMLDivElement;

  hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle("hidden");
  });

  // Close menu on click outside
  document.addEventListener(
    "click",
    () => {
      menuDropdown.classList.add("hidden");
    },
    { once: true, capture: false },
  );

  // Prevent menu clicks from closing via the document listener
  menuDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Add Project
  container.querySelector("#menu-add-project")?.addEventListener("click", () => {
    menuDropdown.classList.add("hidden");
    callbacks.onAddProject();
  });

  // Remove Project buttons
  container.querySelectorAll("[data-remove-project-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const projectId = Number((btn as HTMLElement).dataset.removeProjectId);
      menuDropdown.classList.add("hidden");
      callbacks.onRemoveProject(projectId);
    });
  });

  // Per-project (+) button — toggle inline form
  container.querySelectorAll(".project-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const projectId = (btn as HTMLElement).dataset.projectId!;
      const form = container.querySelector(`[data-form-project-id="${projectId}"]`) as HTMLDivElement;
      const wasHidden = form.classList.contains("hidden");
      // Close all other inline forms
      container.querySelectorAll(".project-inline-form").forEach((f) => f.classList.add("hidden"));
      if (wasHidden) {
        form.classList.remove("hidden");
        (form.querySelector("input") as HTMLInputElement).focus();
      }
    });
  });

  // Inline task input — submit on Enter
  container.querySelectorAll(".inline-task-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      const event = e as KeyboardEvent;
      if (event.key === "Enter") {
        const el = input as HTMLInputElement;
        const name = el.value.trim();
        if (!name) return;
        const projectId = Number(el.dataset.inputProjectId);
        callbacks.onQuickTask(projectId, name);
        el.value = "";
        el.closest(".project-inline-form")!.classList.add("hidden");
      } else if (event.key === "Escape") {
        (input as HTMLInputElement).value = "";
        (input as HTMLInputElement).closest(".project-inline-form")!.classList.add("hidden");
      }
    });
  });

  // Task selection via delegation
  container.querySelectorAll(".task-row").forEach((row) => {
    row.addEventListener("click", () => {
      const taskId = Number((row as HTMLElement).dataset.taskId);
      callbacks.onTaskSelect(taskId);
    });
  });
}
