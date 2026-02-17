import type { Project, CodingInterface } from "./types.ts";
import { AVAILABLE_MODELS } from "./constants.ts";
import { escapeHtml } from "./utils.ts";

export interface ToolbarProps {
  selectedModelId: string;
  selectedProject: Project | null;
  projects: Project[];
  branchName: string | null;
}

export interface ToolbarCallbacks {
  onModelChange: (modelId: string) => void;
  onProjectChange: (projectId: number) => void;
  onAddProject: () => void;
}

const CHEVRON_DOWN = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
const BRANCH_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25z"/></svg>`;
const FOLDER_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L6.354 1.354A.5.5 0 006 1.5H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.69l1.146 1.146A.5.5 0 007.19 4h7.06a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`;

let activeDropdown: HTMLElement | null = null;

function closeDropdown(): void {
  activeDropdown?.remove();
  activeDropdown = null;
}

function getInterfaceForModel(modelId: string): CodingInterface {
  for (const group of AVAILABLE_MODELS) {
    if (group.models.some((m) => m.id === modelId)) return group.interface;
  }
  return "claude";
}

function getInterfaceLabel(modelId: string): string {
  for (const group of AVAILABLE_MODELS) {
    if (group.models.some((m) => m.id === modelId)) return group.label;
  }
  return "Claude";
}

function getModelDisplayLabel(modelId: string): string {
  for (const group of AVAILABLE_MODELS) {
    const model = group.models.find((m) => m.id === modelId);
    if (model) return model.label;
  }
  return "Model";
}

function openInterfaceDropdown(anchor: HTMLElement, selectedModelId: string, onSelect: (id: string) => void): void {
  closeDropdown();

  const currentInterface = getInterfaceForModel(selectedModelId);
  const dropdown = document.createElement("div");
  dropdown.className = "toolbar-dropdown";

  for (const group of AVAILABLE_MODELS) {
    const item = document.createElement("button");
    item.className = "toolbar-dropdown-item";
    if (group.interface === currentInterface) item.classList.add("toolbar-dropdown-item--active");
    item.innerHTML = `<span>${escapeHtml(group.label)}</span>${group.interface === currentInterface ? '<span class="toolbar-dropdown-check">&#10003;</span>' : ""}`;
    item.addEventListener("click", () => {
      // Select first model in the chosen interface group
      onSelect(group.models[0].id);
      closeDropdown();
    });
    dropdown.appendChild(item);
  }

  positionDropdown(dropdown, anchor);
  activeDropdown = dropdown;

  setTimeout(() => {
    document.addEventListener("click", closeDropdown, { once: true });
  }, 0);
}

function openModelDropdown(anchor: HTMLElement, selectedModelId: string, onSelect: (id: string) => void): void {
  closeDropdown();

  const currentInterface = getInterfaceForModel(selectedModelId);
  const group = AVAILABLE_MODELS.find((g) => g.interface === currentInterface);
  if (!group) return;

  const dropdown = document.createElement("div");
  dropdown.className = "toolbar-dropdown";

  for (const model of group.models) {
    const item = document.createElement("button");
    item.className = "toolbar-dropdown-item";
    if (model.id === selectedModelId) item.classList.add("toolbar-dropdown-item--active");
    item.innerHTML = `<span>${escapeHtml(model.label)}</span>${model.id === selectedModelId ? '<span class="toolbar-dropdown-check">&#10003;</span>' : ""}`;
    item.addEventListener("click", () => {
      onSelect(model.id);
      closeDropdown();
    });
    dropdown.appendChild(item);
  }

  positionDropdown(dropdown, anchor);
  activeDropdown = dropdown;

  setTimeout(() => {
    document.addEventListener("click", closeDropdown, { once: true });
  }, 0);
}

function openProjectDropdown(anchor: HTMLElement, projects: Project[], selectedId: number | null, callbacks: ToolbarCallbacks): void {
  closeDropdown();

  const dropdown = document.createElement("div");
  dropdown.className = "toolbar-dropdown";

  for (const project of projects) {
    const item = document.createElement("button");
    item.className = "toolbar-dropdown-item";
    if (project.id === selectedId) item.classList.add("toolbar-dropdown-item--active");
    item.innerHTML = `${FOLDER_ICON} <span>${escapeHtml(project.name)}</span>${project.id === selectedId ? '<span class="toolbar-dropdown-check">&#10003;</span>' : ""}`;
    item.addEventListener("click", () => {
      callbacks.onProjectChange(project.id);
      closeDropdown();
    });
    dropdown.appendChild(item);
  }

  const sep = document.createElement("div");
  sep.className = "toolbar-dropdown-separator";
  dropdown.appendChild(sep);

  const addItem = document.createElement("button");
  addItem.className = "toolbar-dropdown-item";
  addItem.textContent = "Add project\u2026";
  addItem.addEventListener("click", () => {
    callbacks.onAddProject();
    closeDropdown();
  });
  dropdown.appendChild(addItem);

  positionDropdown(dropdown, anchor);
  activeDropdown = dropdown;

  setTimeout(() => {
    document.addEventListener("click", closeDropdown, { once: true });
  }, 0);
}

function positionDropdown(dropdown: HTMLElement, anchor: HTMLElement): void {
  document.body.appendChild(dropdown);
  const rect = anchor.getBoundingClientRect();
  dropdown.style.position = "fixed";
  dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  dropdown.style.left = `${rect.left}px`;
}

export function renderToolbar(
  container: HTMLElement,
  props: ToolbarProps,
  callbacks: ToolbarCallbacks,
): void {
  const existing = container.querySelector(".bottom-toolbar");
  if (existing) existing.remove();

  const toolbar = document.createElement("div");
  toolbar.className = "bottom-toolbar";

  const projectName = props.selectedProject ? escapeHtml(props.selectedProject.name) : "No project";
  const interfaceLabel = getInterfaceLabel(props.selectedModelId);
  const modelLabel = getModelDisplayLabel(props.selectedModelId);

  toolbar.innerHTML = `
    <div class="bottom-toolbar-left">
      <button class="statusbar-chip" id="toolbar-interface-btn">${escapeHtml(interfaceLabel)} ${CHEVRON_DOWN}</button>
      <button class="statusbar-chip" id="toolbar-model-btn">${escapeHtml(modelLabel)} ${CHEVRON_DOWN}</button>
    </div>
    <div class="bottom-toolbar-right">
      ${props.branchName ? `<span class="statusbar-info">${BRANCH_ICON} ${escapeHtml(props.branchName)}</span>` : ""}
      <button class="statusbar-chip toolbar-project-btn" id="toolbar-project-btn">${FOLDER_ICON} ${projectName} ${CHEVRON_DOWN}</button>
    </div>`;

  container.appendChild(toolbar);

  toolbar.querySelector("#toolbar-interface-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openInterfaceDropdown(e.currentTarget as HTMLElement, props.selectedModelId, callbacks.onModelChange);
  });

  toolbar.querySelector("#toolbar-model-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openModelDropdown(e.currentTarget as HTMLElement, props.selectedModelId, callbacks.onModelChange);
  });

  toolbar.querySelector("#toolbar-project-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProjectDropdown(
      e.currentTarget as HTMLElement,
      props.projects,
      props.selectedProject?.id ?? null,
      callbacks,
    );
  });
}
