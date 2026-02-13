import type { Project } from "./types.ts";
import { escapeHtml } from "./utils.ts";

export interface StartPageCallbacks {
  onPromptSubmit: (projectId: number, prompt: string) => void;
  onProjectSelect: (projectId: number) => void;
  onAddProject: () => void;
}

const FOLDER_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="opacity:0.6"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L6.354 1.354A.5.5 0 006 1.5H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.69l1.146 1.146A.5.5 0 007.19 4h7.06a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`;
const CHEVRON_DOWN = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
const SEND_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

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

  container.innerHTML = `
    <div class="start-page">
      <div class="start-page-hero">
        <h1 class="start-page-title">What do you want to build?</h1>
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
      <div class="start-page-prompt">
        <textarea
          class="start-page-input"
          id="start-page-input"
          placeholder="Describe your task..."
          rows="1"
          ${!hasProjects ? "disabled" : ""}
        ></textarea>
        <button class="start-page-send-btn" id="start-page-send" ${!hasProjects ? "disabled" : ""} title="Send">
          ${SEND_ICON}
        </button>
      </div>
    </div>`;

  const input = container.querySelector("#start-page-input") as HTMLTextAreaElement;
  const sendBtn = container.querySelector("#start-page-send") as HTMLButtonElement;

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

  // Enter to submit (Shift+Enter for newline)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  sendBtn.addEventListener("click", submit);

  // Add project button (when no projects)
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

    // Esc to close
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closeDropdown();
        document.removeEventListener("keydown", onEsc);
      }
    };
    document.addEventListener("keydown", onEsc);
  });

  // Focus the input on render
  if (hasProjects) {
    requestAnimationFrame(() => input.focus());
  }
}
