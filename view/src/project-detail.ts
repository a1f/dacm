import type { Project, ProjectStatus } from "./types.ts";
import { createTerminalSession, type TerminalSession } from "./terminal.ts";
import { escapeHtml } from "./utils.ts";
import { renderToolbar, type ToolbarProps } from "./toolbar.ts";

export interface ProjectDetailCallbacks {
  onStatusChange: (projectId: number, status: ProjectStatus) => void;
  onSimulate: (projectId: number) => void;
  onArchive: (projectId: number) => void;
  onKillSession: (projectId: number) => void;
  onRestartSession: (projectId: number) => void;
  onModelChange: (modelId: string) => void;
  onWorkspaceChange: (workspaceId: number) => void;
  onAddWorkspace: () => void;
}

interface CachedTerminal {
  session: TerminalSession;
  wrapper: HTMLElement;
}

const terminalCache = new Map<string, CachedTerminal>();
let activeTerminalSessionId: string | null = null;

function statusBadgeHtml(status: string): string {
  return `<span class="status-badge status-badge--${status}">${status}</span>`;
}

function renderSessionHeader(
  container: HTMLElement,
  project: Project,
  isRunning: boolean,
  callbacks: ProjectDetailCallbacks,
): void {
  const headerActions = isRunning
    ? `<button class="btn btn-kill" id="btn-kill-session">Kill</button>`
    : `<div class="session-header-actions">
        <button class="btn btn-session-action" id="btn-archive">Archive</button>
        <button class="btn btn-restart" id="btn-restart">Restart Session</button>
      </div>`;

  container.innerHTML = `
    <div class="session-header" data-tauri-drag-region>
      <span class="session-header-title">${escapeHtml(project.name)} ${statusBadgeHtml(project.status)}</span>
      ${headerActions}
    </div>`;

  if (isRunning) {
    container.querySelector("#btn-kill-session")?.addEventListener("click", () => {
      callbacks.onKillSession(project.id);
    });
  } else {
    container.querySelector("#btn-archive")?.addEventListener("click", () => {
      callbacks.onArchive(project.id);
    });
    container.querySelector("#btn-restart")?.addEventListener("click", () => {
      callbacks.onRestartSession(project.id);
    });
  }
}

function swapToExitedHeader(
  container: HTMLElement,
  project: Project,
  callbacks: ProjectDetailCallbacks,
): void {
  const headerTitle = container.querySelector(".session-header-title");
  if (headerTitle) {
    headerTitle.innerHTML = `${escapeHtml(project.name)} ${statusBadgeHtml("completed")}`;
  }
  const killBtn = container.querySelector("#btn-kill-session");
  if (killBtn) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "session-header-actions";
    actionsDiv.innerHTML = `
      <button class="btn btn-session-action" id="btn-archive">Archive</button>
      <button class="btn btn-restart" id="btn-restart">Restart Session</button>`;
    killBtn.replaceWith(actionsDiv);
    actionsDiv.querySelector("#btn-archive")?.addEventListener("click", () => callbacks.onArchive(project.id));
    actionsDiv.querySelector("#btn-restart")?.addEventListener("click", () => callbacks.onRestartSession(project.id));
  }
}

function renderToolbarFromCallbacks(container: HTMLElement, toolbarProps: ToolbarProps, callbacks: ProjectDetailCallbacks): void {
  renderToolbar(container, toolbarProps, {
    onModelChange: callbacks.onModelChange,
    onWorkspaceChange: callbacks.onWorkspaceChange,
    onAddWorkspace: callbacks.onAddWorkspace,
  });
}

function renderTerminalView(
  container: HTMLElement,
  project: Project,
  sessionId: string,
  toolbarProps: ToolbarProps,
  callbacks: ProjectDetailCallbacks,
): void {
  if (activeTerminalSessionId === sessionId) return;

  detachCurrentTerminal(container);

  const isRunning = project.status === "running";
  container.classList.add("terminal-mode");
  renderSessionHeader(container, project, isRunning, callbacks);

  activeTerminalSessionId = sessionId;

  const cached = terminalCache.get(sessionId);
  if (cached) {
    container.appendChild(cached.wrapper);
    renderToolbarFromCallbacks(container, toolbarProps, callbacks);
    requestAnimationFrame(() => {
      cached.session.fit();
      cached.session.terminal.focus();
    });
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "terminal-container";
  wrapper.id = "terminal-container";
  container.appendChild(wrapper);
  renderToolbarFromCallbacks(container, toolbarProps, callbacks);

  createTerminalSession(wrapper, sessionId, () => {
    swapToExitedHeader(container, project, callbacks);
  }).then((session) => {
    terminalCache.set(sessionId, { session, wrapper });
    session.terminal.focus();
  }).catch((e) => {
    console.error("Failed to create terminal session:", e);
    wrapper.textContent = `Failed to start terminal: ${e}`;
  });
}

function detachCurrentTerminal(container: HTMLElement): void {
  if (!activeTerminalSessionId) return;
  const cached = terminalCache.get(activeTerminalSessionId);
  if (cached?.wrapper.parentNode === container) {
    container.removeChild(cached.wrapper);
  }
  activeTerminalSessionId = null;
}

function renderNoSessionView(
  container: HTMLElement,
  project: Project,
  toolbarProps: ToolbarProps,
  callbacks: ProjectDetailCallbacks,
): void {
  container.classList.add("terminal-mode");
  container.innerHTML = `
    <div class="session-header" data-tauri-drag-region>
      <span class="session-header-title">${escapeHtml(project.name)} ${statusBadgeHtml(project.status)}</span>
      <div class="session-header-actions">
        <button class="btn btn-session-action" id="btn-archive">Archive</button>
      </div>
    </div>
    <div class="no-session-body">
      <div class="no-session-message">
        <span class="no-session-label">Session ended</span>
        <button class="btn btn-restart" id="btn-restart">Restart Session</button>
      </div>
    </div>`;

  renderToolbarFromCallbacks(container, toolbarProps, callbacks);

  container.querySelector("#btn-restart")?.addEventListener("click", () => {
    callbacks.onRestartSession(project.id);
  });

  container.querySelector("#btn-archive")?.addEventListener("click", () => {
    callbacks.onArchive(project.id);
  });
}

export function renderProjectDetail(
  container: HTMLElement,
  project: Project,
  activeSessionId: string | null,
  toolbarProps: ToolbarProps,
  callbacks: ProjectDetailCallbacks,
): void {
  if (activeSessionId) {
    renderTerminalView(container, project, activeSessionId, toolbarProps, callbacks);
    return;
  }

  detachCurrentTerminal(container);
  renderNoSessionView(container, project, toolbarProps, callbacks);
}

export function detachActiveTerminal(container: HTMLElement): void {
  detachCurrentTerminal(container);
}

export function destroyTerminalForSession(sessionId: string): void {
  const cached = terminalCache.get(sessionId);
  if (cached) {
    cached.session.destroy();
    cached.wrapper.remove();
    terminalCache.delete(sessionId);
  }
  if (activeTerminalSessionId === sessionId) {
    activeTerminalSessionId = null;
  }
}
