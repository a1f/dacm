import type { Workspace, Project } from "./types.ts";
import { setTheme, getEffectiveTheme } from "./theme.ts";
import type { ThemeMode } from "./types.ts";
import { escapeHtml, formatAge } from "./utils.ts";

export interface SidebarCallbacks {
  onProjectSelect: (projectId: number) => void;
  onRenameProject: (projectId: number, name: string) => void;
  onNewThread: () => void;
  onNewProjectForWorkspace: (workspaceId: number) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (workspaceId: number) => void;
  onArchiveProject: (projectId: number) => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}

const collapsedWorkspaces = new Set<number>();

function statusIndicatorHtml(status: string): string {
  switch (status) {
    case "running":
      return `<span class="status-indicator status-running" title="Running"></span>`;
    case "waiting":
      return `<span class="status-indicator status-waiting" title="Waiting">?</span>`;
    case "completed":
      return `<span class="status-indicator status-completed" title="Completed"></span>`;
    case "failed":
      return `<span class="status-indicator status-failed" title="Failed"></span>`;
    default:
      return "";
  }
}

const CHEVRON_RIGHT = `<svg class="tree-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`;
const CHEVRON_DOWN = `<svg class="tree-chevron tree-chevron--open" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
const FOLDER_ICON = `<svg class="tree-folder-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L6.354 1.354A.5.5 0 006 1.5H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.69l1.146 1.146A.5.5 0 007.19 4h7.06a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`;
const GEAR_ICON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>`;
const PLUS_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>`;
const PANEL_LEFT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
const SMALL_PLUS_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>`;

let activeContextMenu: HTMLElement | null = null;
let activeGearMenu: HTMLElement | null = null;

function closeContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function closeGearMenu(): void {
  if (activeGearMenu) {
    activeGearMenu.remove();
    activeGearMenu = null;
  }
}

function closeAllMenus(): void {
  closeContextMenu();
  closeGearMenu();
}

let escListenerRegistered = false;
function ensureEscListener(): void {
  if (escListenerRegistered) return;
  escListenerRegistered = true;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (activeContextMenu || activeGearMenu) {
        e.preventDefault();
        closeAllMenus();
      }
    }
  });
}

const ARCHIVE_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;

export function renderSidebar(
  container: HTMLElement,
  workspaces: Workspace[],
  projects: Project[],
  selectedProjectId: number | null,
  callbacks: SidebarCallbacks,
): void {
  const tree = container.querySelector(".sidebar-tree");
  const scrollTop = tree?.scrollTop ?? 0;

  const projectsByWorkspace = new Map<number, Project[]>();
  for (const project of projects) {
    const list = projectsByWorkspace.get(project.workspace_id) ?? [];
    list.push(project);
    projectsByWorkspace.set(project.workspace_id, list);
  }

  for (const [, workspaceProjects] of projectsByWorkspace) {
    workspaceProjects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const workspaceGroupsHtml = workspaces
    .map((workspace) => {
      const workspaceProjects = projectsByWorkspace.get(workspace.id) ?? [];
      const isCollapsed = collapsedWorkspaces.has(workspace.id);

      const projectsHtml = isCollapsed
        ? ""
        : workspaceProjects
            .map(
              (project) => `
          <div class="project-row ${project.id === selectedProjectId ? "project-row--selected" : ""}" data-project-id="${project.id}">
            ${statusIndicatorHtml(project.status)}
            <span class="project-name">${escapeHtml(project.name)}</span>
            <span class="project-age">${formatAge(project.created_at)}</span>
            <button class="project-archive-btn" data-archive-project-id="${project.id}" title="Archive">${ARCHIVE_ICON}</button>
          </div>`,
            )
            .join("");

      return `
        <div class="workspace-group">
          <div class="workspace-group-header" data-workspace-id="${workspace.id}">
            ${isCollapsed ? CHEVRON_RIGHT : CHEVRON_DOWN}
            ${FOLDER_ICON}
            <span class="workspace-group-name">${escapeHtml(workspace.name)}</span>
            <button class="workspace-add-project-btn" data-add-project-workspace-id="${workspace.id}" title="New project in ${escapeHtml(workspace.name)}">
              ${SMALL_PLUS_ICON}
            </button>
          </div>
          ${projectsHtml}
        </div>`;
    })
    .join("");

  ensureEscListener();

  container.innerHTML = `
    <div class="sidebar-titlebar">
      <button class="sidebar-hide-btn" id="sidebar-hide-btn" title="Hide sidebar (Cmd+B)">
        ${PANEL_LEFT_ICON}
      </button>
    </div>
    <div class="sidebar-top">
      <button class="new-thread-btn" id="new-thread-btn">
        ${PLUS_ICON}
        <span>New project</span>
      </button>
    </div>
    <div class="sidebar-tree">
      ${workspaceGroupsHtml}
    </div>
    <div class="sidebar-bottom">
      <button class="sidebar-gear-btn" id="sidebar-gear-btn" title="Settings">
        ${GEAR_ICON}
      </button>
    </div>`;

  container.querySelector("#new-thread-btn")?.addEventListener("click", () => {
    callbacks.onNewThread();
  });

  container.querySelector("#sidebar-hide-btn")?.addEventListener("click", () => {
    callbacks.onToggleSidebar();
  });

  container.querySelector("#sidebar-gear-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeGearMenu) {
      closeGearMenu();
      return;
    }

    const btn = container.querySelector("#sidebar-gear-btn") as HTMLElement;
    const rect = btn.getBoundingClientRect();

    const menu = document.createElement("div");
    menu.className = "gear-menu";

    const currentTheme = getEffectiveTheme();
    const themeLabel = currentTheme === "dark" ? "Light mode" : "Dark mode";
    const nextTheme: ThemeMode = currentTheme === "dark" ? "light" : "dark";

    menu.innerHTML = `
      <button class="gear-menu-item" data-action="add-workspace">Add Workspace</button>
      <div class="gear-menu-separator"></div>
      <button class="gear-menu-item" data-action="toggle-theme">${themeLabel}</button>
      <button class="gear-menu-item" data-action="settings">Settings</button>`;

    menu.style.position = "fixed";
    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    document.body.appendChild(menu);
    activeGearMenu = menu;

    menu.querySelector("[data-action='add-workspace']")?.addEventListener("click", () => {
      closeGearMenu();
      callbacks.onAddWorkspace();
    });

    menu.querySelector("[data-action='toggle-theme']")?.addEventListener("click", () => {
      closeGearMenu();
      setTheme(nextTheme);
    });

    menu.querySelector("[data-action='settings']")?.addEventListener("click", () => {
      closeGearMenu();
      callbacks.onOpenSettings();
    });

    setTimeout(() => {
      document.addEventListener("click", closeGearMenu, { once: true });
    }, 0);
  });

  const newTree = container.querySelector(".sidebar-tree");
  if (newTree) newTree.scrollTop = scrollTop;

  container.querySelectorAll(".workspace-group-header").forEach((header) => {
    header.addEventListener("click", () => {
      const workspaceId = Number((header as HTMLElement).dataset.workspaceId);
      if (collapsedWorkspaces.has(workspaceId)) {
        collapsedWorkspaces.delete(workspaceId);
      } else {
        collapsedWorkspaces.add(workspaceId);
      }
      renderSidebar(container, workspaces, projects, selectedProjectId, callbacks);
    });
  });

  container.querySelectorAll(".workspace-add-project-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const workspaceId = Number((btn as HTMLElement).dataset.addProjectWorkspaceId);
      callbacks.onNewProjectForWorkspace(workspaceId);
    });
  });

  container.querySelectorAll(".workspace-group-header").forEach((header) => {
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      closeContextMenu();

      const workspaceId = Number((header as HTMLElement).dataset.workspaceId);
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace) return;

      const menu = document.createElement("div");
      menu.className = "context-menu";
      menu.innerHTML = `
        <button class="context-menu-item context-menu-item--danger" data-action="remove">
          Remove "${escapeHtml(workspace.name)}"
        </button>`;

      const mouseEvent = e as MouseEvent;
      menu.style.left = `${mouseEvent.clientX}px`;
      menu.style.top = `${mouseEvent.clientY}px`;
      document.body.appendChild(menu);
      activeContextMenu = menu;

      menu.querySelector("[data-action='remove']")?.addEventListener("click", () => {
        closeContextMenu();
        if (confirm(`Remove workspace "${workspace.name}"? Projects will be preserved.`)) {
          callbacks.onRemoveWorkspace(workspaceId);
        }
      });

      setTimeout(() => {
        document.addEventListener("click", closeContextMenu, { once: true });
      }, 0);
    });
  });

  container.querySelectorAll(".project-archive-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const projectId = Number((btn as HTMLElement).dataset.archiveProjectId);
      callbacks.onArchiveProject(projectId);
    });
  });

  container.querySelectorAll(".project-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const projectId = Number((row as HTMLElement).dataset.projectId);
      const clickedName = (e.target as HTMLElement).closest(".project-name");
      if (clickedName && projectId === selectedProjectId) {
        e.stopPropagation();
        startInlineRename(clickedName as HTMLElement, projectId, callbacks);
        return;
      }
      callbacks.onProjectSelect(projectId);
    });
  });
}

function startInlineRename(nameEl: HTMLElement, projectId: number, callbacks: SidebarCallbacks): void {
  if (nameEl.tagName === "INPUT") return;
  const currentName = nameEl.textContent ?? "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "project-name-input";
  input.value = currentName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  function commit(): void {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      callbacks.onRenameProject(projectId, newName);
    } else {
      const span = document.createElement("span");
      span.className = "project-name";
      span.textContent = currentName;
      input.replaceWith(span);
    }
  }

  input.addEventListener("keydown", (ke) => {
    if (ke.key === "Enter") {
      ke.preventDefault();
      commit();
    } else if (ke.key === "Escape") {
      ke.preventDefault();
      committed = true;
      const span = document.createElement("span");
      span.className = "project-name";
      span.textContent = currentName;
      input.replaceWith(span);
    }
  });

  input.addEventListener("blur", commit);
}

export function triggerRenameSelected(container: HTMLElement, selectedProjectId: number | null, callbacks: SidebarCallbacks): void {
  if (selectedProjectId === null) return;
  const row = container.querySelector(`.project-row[data-project-id="${selectedProjectId}"]`);
  const nameEl = row?.querySelector(".project-name") as HTMLElement | null;
  if (nameEl) startInlineRename(nameEl, selectedProjectId, callbacks);
}
