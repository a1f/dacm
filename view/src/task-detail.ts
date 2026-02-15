import type { Task, TaskStatus } from "./types.ts";
import { createTerminalSession, type TerminalSession } from "./terminal.ts";
import { escapeHtml } from "./utils.ts";

export interface TaskDetailCallbacks {
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onSimulate: (taskId: number) => void;
  onArchive: (taskId: number) => void;
  onKillSession: (taskId: number) => void;
  onRestartSession: (taskId: number) => void;
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
  task: Task,
  isRunning: boolean,
  callbacks: TaskDetailCallbacks,
): void {
  const headerActions = isRunning
    ? `<button class="btn btn-kill" id="btn-kill-session">Kill</button>`
    : `<div class="session-header-actions">
        <button class="btn btn-session-action" id="btn-archive">Archive</button>
        <button class="btn btn-restart" id="btn-restart">Restart Session</button>
      </div>`;

  container.innerHTML = `
    <div class="session-header" data-tauri-drag-region>
      <span class="session-header-title">${escapeHtml(task.name)} ${statusBadgeHtml(task.status)}</span>
      ${headerActions}
    </div>`;

  if (isRunning) {
    container.querySelector("#btn-kill-session")?.addEventListener("click", () => {
      callbacks.onKillSession(task.id);
    });
  } else {
    container.querySelector("#btn-archive")?.addEventListener("click", () => {
      callbacks.onArchive(task.id);
    });
    container.querySelector("#btn-restart")?.addEventListener("click", () => {
      callbacks.onRestartSession(task.id);
    });
  }
}

function swapToExitedHeader(
  container: HTMLElement,
  task: Task,
  callbacks: TaskDetailCallbacks,
): void {
  const headerTitle = container.querySelector(".session-header-title");
  if (headerTitle) {
    headerTitle.innerHTML = `${escapeHtml(task.name)} ${statusBadgeHtml("completed")}`;
  }
  const killBtn = container.querySelector("#btn-kill-session");
  if (killBtn) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "session-header-actions";
    actionsDiv.innerHTML = `
      <button class="btn btn-session-action" id="btn-archive">Archive</button>
      <button class="btn btn-restart" id="btn-restart">Restart Session</button>`;
    killBtn.replaceWith(actionsDiv);
    actionsDiv.querySelector("#btn-archive")?.addEventListener("click", () => callbacks.onArchive(task.id));
    actionsDiv.querySelector("#btn-restart")?.addEventListener("click", () => callbacks.onRestartSession(task.id));
  }
}

function renderTerminalView(
  container: HTMLElement,
  task: Task,
  sessionId: string,
  callbacks: TaskDetailCallbacks,
): void {
  if (activeTerminalSessionId === sessionId) return;

  // Detach current terminal wrapper (keep it alive in cache)
  detachCurrentTerminal(container);

  const isRunning = task.status === "running";
  container.classList.add("terminal-mode");
  renderSessionHeader(container, task, isRunning, callbacks);

  activeTerminalSessionId = sessionId;

  const cached = terminalCache.get(sessionId);
  if (cached) {
    container.appendChild(cached.wrapper);
    // Refit after reattaching to DOM — layout needs a frame to settle
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

  createTerminalSession(wrapper, sessionId, () => {
    swapToExitedHeader(container, task, callbacks);
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
  task: Task,
  callbacks: TaskDetailCallbacks,
): void {
  container.classList.add("terminal-mode");
  container.innerHTML = `
    <div class="session-header" data-tauri-drag-region>
      <span class="session-header-title">${escapeHtml(task.name)} ${statusBadgeHtml(task.status)}</span>
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

  container.querySelector("#btn-restart")?.addEventListener("click", () => {
    callbacks.onRestartSession(task.id);
  });

  container.querySelector("#btn-archive")?.addEventListener("click", () => {
    callbacks.onArchive(task.id);
  });
}

export function renderTaskDetail(
  container: HTMLElement,
  task: Task,
  activeSessionId: string | null,
  callbacks: TaskDetailCallbacks,
): void {
  if (activeSessionId) {
    renderTerminalView(container, task, activeSessionId, callbacks);
    return;
  }

  detachCurrentTerminal(container);
  renderNoSessionView(container, task, callbacks);
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
