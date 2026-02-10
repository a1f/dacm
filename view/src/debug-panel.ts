import { invoke } from "@tauri-apps/api/core";
import type { SessionInfo } from "./types.ts";

export interface DebugPanelCallbacks {
  onClose: () => void;
  onKillSession: (sessionId: string) => void;
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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function renderDebugPanel(
  container: HTMLElement,
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

  async function loadSessions() {
    try {
      const sessions = await invoke<SessionInfo[]>("list_sessions");
      if (sessions.length === 0) {
        body.innerHTML = `<p class="debug-empty">No active sessions</p>`;
        return;
      }

      const rows = sessions.map((s) => `
        <tr>
          <td>${s.pid ?? "—"}</td>
          <td class="debug-mono">${escapeHtml(s.working_dir)}</td>
          <td>${s.task_id}</td>
          <td><span class="status-badge status-badge--${s.status === "running" ? "running" : "completed"}">${s.status}</span></td>
          <td>${formatUptime(s.uptime_secs)}</td>
          <td><button class="btn btn-kill-debug" data-session-id="${s.session_id}" ${s.status !== "running" ? "disabled" : ""}>Kill</button></td>
        </tr>`).join("");

      body.innerHTML = `
        <table class="debug-table">
          <thead><tr><th>PID</th><th>Working Dir</th><th>Task</th><th>Status</th><th>Uptime</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      body.querySelectorAll(".btn-kill-debug").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sessionId = (btn as HTMLElement).dataset.sessionId!;
          callbacks.onKillSession(sessionId);
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
