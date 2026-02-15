import type { Project } from "./types.ts";
import { escapeHtml } from "./utils.ts";

export interface StartPageCallbacks {
  onPromptSubmit: (projectId: number, prompt: string) => void;
  onProjectSelect: (projectId: number) => void;
  onAddProject: () => void;
}

const FOLDER_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L6.354 1.354A.5.5 0 006 1.5H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.69l1.146 1.146A.5.5 0 007.19 4h7.06a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`;
const CHEVRON_DOWN = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
const BRANCH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25z"/></svg>`;
const SEND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

let activeDropdown: HTMLElement | null = null;

function closeDropdown(): void {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

export function renderStartPage(
  container: HTMLElement,
  projects: Project[],
  selectedProjectId: number | null,
  callbacks: StartPageCallbacks,
): void {
  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? projects[0]
    : projects[0];

  const hasProjects = projects.length > 0;
  const projectLabel = selectedProject ? escapeHtml(selectedProject.name) : "No projects";
  const projectPath = selectedProject ? escapeHtml(selectedProject.path) : "";

  container.innerHTML = `
    <div class="start-page">
      <div class="start-page-header" data-tauri-drag-region>
        <span class="start-page-header-label">New Task</span>
        ${hasProjects ? `
          <button class="project-picker-btn" id="project-picker-btn">
            ${FOLDER_ICON}
            <span class="project-picker-label">${projectLabel}</span>
            ${CHEVRON_DOWN}
          </button>
        ` : `
          <button class="project-picker-btn project-picker-btn--empty" id="add-project-btn">
            Add a project to get started
          </button>
        `}
      </div>
      <div class="start-page-terminal-area"></div>
      <div class="start-page-bottom">
        <div class="prompt-input-row">
          <span class="prompt-char">&gt;</span>
          <textarea
            class="prompt-textarea"
            id="start-page-input"
            placeholder="Describe your task..."
            rows="1"
            ${!hasProjects ? "disabled" : ""}
          ></textarea>
          <button class="prompt-send-btn" id="prompt-send-btn" ${!hasProjects ? "disabled" : ""} title="Send (Enter)">${SEND_ICON}</button>
        </div>
        <div class="prompt-toolbar">
          <div class="prompt-toolbar-left">
            <button class="toolbar-chip" id="toolbar-model">Opus 4.6 ${CHEVRON_DOWN}</button>
            <button class="toolbar-chip" id="toolbar-mode">Auto ${CHEVRON_DOWN}</button>
          </div>
          <div class="prompt-toolbar-right">
            ${hasProjects ? `<span class="toolbar-info">${BRANCH_ICON} main</span>` : ""}
            <span class="toolbar-info toolbar-path">${projectPath}</span>
          </div>
        </div>
      </div>
    </div>`;

  const input = container.querySelector("#start-page-input") as HTMLTextAreaElement;
  const sendBtn = container.querySelector("#prompt-send-btn") as HTMLButtonElement;

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  });

  function submit(): void {
    const prompt = input.value.trim();
    if (!prompt || !selectedProject) return;
    callbacks.onPromptSubmit(selectedProject.id, prompt);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  sendBtn.addEventListener("click", submit);

  container.querySelector("#add-project-btn")?.addEventListener("click", () => {
    callbacks.onAddProject();
  });

  // Project picker dropdown
  container.querySelector("#project-picker-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeDropdown) {
      closeDropdown();
      return;
    }

    const btn = container.querySelector("#project-picker-btn") as HTMLElement;
    const rect = btn.getBoundingClientRect();

    const dropdown = document.createElement("div");
    dropdown.className = "project-picker-dropdown";

    const itemsHtml = projects
      .map(
        (p) => `
        <button class="project-picker-item ${p.id === selectedProject?.id ? "project-picker-item--active" : ""}" data-project-id="${p.id}">
          ${FOLDER_ICON}
          <span>${escapeHtml(p.name)}</span>
        </button>`,
      )
      .join("");

    dropdown.innerHTML = `
      ${itemsHtml}
      <div class="project-picker-separator"></div>
      <button class="project-picker-item" data-action="add-project">
        <span style="opacity:0.5">+</span>
        <span>Add project</span>
      </button>`;

    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.minWidth = `${rect.width}px`;
    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    dropdown.querySelectorAll("[data-project-id]").forEach((item) => {
      item.addEventListener("click", () => {
        const projectId = Number((item as HTMLElement).dataset.projectId);
        closeDropdown();
        callbacks.onProjectSelect(projectId);
      });
    });

    dropdown.querySelector("[data-action='add-project']")?.addEventListener("click", () => {
      closeDropdown();
      callbacks.onAddProject();
    });

    setTimeout(() => {
      document.addEventListener("click", closeDropdown, { once: true });
    }, 0);

    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closeDropdown();
        document.removeEventListener("keydown", onEsc);
      }
    };
    document.addEventListener("keydown", onEsc);
  });

  if (hasProjects) {
    requestAnimationFrame(() => input.focus());
  }
}
