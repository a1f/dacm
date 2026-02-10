import { invoke } from "@tauri-apps/api/core";
import type { Task } from "./types.ts";
import type { SessionInfo } from "./types.ts";

export interface DebugPanelCallbacks {
  onClose: () => void;
  onKillSession: (sessionId: string) => void;
  onGoToTask: (taskId: number) => void;
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  if (mins < 60) return `${mins}m ${s}s`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return `${hrs}h ${m}m`;
}

function formatStartTime(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en", { month: "short" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month} ${year}, ${time}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function renderDebugPanel(
  container: HTMLElement,
  tasks: Task[],
  callbacks: DebugPanelCallbacks,
): void {
  container.innerHTML = `
    <div class="debug-panel">
      <div class="debug-panel-header">
        <h2 class="debug-panel-title">Sessions</h2>
        <div class="debug-panel-actions">
          <button class="btn" id="debug-refresh">Refresh</button>
          <button class="btn" id="debug-close">Close</button>
        </div>
      </div>
      <div class="debug-panel-body" id="debug-body">Loading...</div>
    </div>`;

  const body = container.querySelector("#debug-body") as HTMLElement;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  async function loadSessions() {
    try {
      const allSessions = await invoke<SessionInfo[]>("list_sessions");
      const sessions = allSessions.filter((s) => s.status === "running");
      if (sessions.length === 0) {
        body.innerHTML = `<p class="debug-empty">No active sessions</p>`;
        return;
      }

      const rows = sessions.map((s) => {
        const task = taskMap.get(s.task_id);
        const taskName = task ? escapeHtml(task.name) : `#${s.task_id}`;
        return `
        <tr>
          <td>${s.pid ?? "—"}</td>
          <td class="debug-mono">${escapeHtml(s.working_dir)}</td>
          <td>${taskName}</td>
          <td>${formatStartTime(s.started_at_epoch)}</td>
          <td>${formatUptime(s.uptime_secs)}</td>
          <td>
            <button class="btn btn-goto-debug" data-task-id="${s.task_id}">Go to</button>
            <button class="btn btn-kill-debug" data-session-id="${s.session_id}">Kill</button>
          </td>
        </tr>`;
      }).join("");

      body.innerHTML = `
        <table class="debug-table">
          <thead><tr><th>PID</th><th>Working Dir</th><th>Task</th><th>Started</th><th>Uptime</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      body.querySelectorAll(".btn-kill-debug").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sessionId = (btn as HTMLElement).dataset.sessionId!;
          callbacks.onKillSession(sessionId);
        });
      });

      body.querySelectorAll(".btn-goto-debug").forEach((btn) => {
        btn.addEventListener("click", () => {
          const taskId = Number((btn as HTMLElement).dataset.taskId!);
          callbacks.onGoToTask(taskId);
        });
      });
    } catch (e) {
      body.innerHTML = `<p class="debug-empty">Error: ${e}</p>`;
    }
  }

  container.querySelector("#debug-refresh")?.addEventListener("click", loadSessions);
  container.querySelector("#debug-close")?.addEventListener("click", callbacks.onClose);

  loadSessions();
}
