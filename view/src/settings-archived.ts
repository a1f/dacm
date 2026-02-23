import { invoke } from "@tauri-apps/api/core";
import type { Workspace, Project } from "./types.ts";
import { escapeHtml } from "./utils.ts";

export interface ArchivedSettingsCallbacks {
  onRestore: (projectId: number) => void;
  onDelete: (projectId: number) => void;
}

export async function renderArchivedSettings(
  container: HTMLElement,
  workspaces: Workspace[],
  callbacks: ArchivedSettingsCallbacks,
): Promise<void> {
  let archivedProjects: Project[];
  try {
    archivedProjects = await invoke<Project[]>("list_archived_projects");
  } catch {
    archivedProjects = [];
  }

  const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));

  const listHtml =
    archivedProjects.length === 0
      ? `<p class="archived-empty">No archived projects.</p>`
      : archivedProjects
          .map((project) => {
            const workspace = workspaceMap.get(project.workspace_id);
            const workspaceName = workspace ? escapeHtml(workspace.name) : "Unknown";
            const date = new Date(project.created_at).toLocaleDateString();
            return `
              <div class="archived-project-row" data-project-id="${project.id}">
                <div class="archived-project-info">
                  <div class="archived-project-name">${escapeHtml(project.name)}</div>
                  <div class="archived-project-meta">${workspaceName} &middot; ${date}</div>
                </div>
                <div class="archived-project-actions">
                  <button class="btn" data-action="restore" data-project-id="${project.id}">Restore</button>
                  <button class="btn btn-archive" data-action="delete" data-project-id="${project.id}">Delete</button>
                </div>
              </div>`;
          })
          .join("");

  container.innerHTML = `
    <div class="settings-page">
      <h2 class="settings-page-title">Archived</h2>
      <div class="archived-project-list">
        ${listHtml}
      </div>
    </div>`;

  container.querySelectorAll("[data-action='restore']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const projectId = Number((btn as HTMLElement).dataset.projectId);
      callbacks.onRestore(projectId);
    });
  });

  container.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const projectId = Number((btn as HTMLElement).dataset.projectId);
      if (confirm("Permanently delete this project?")) {
        callbacks.onDelete(projectId);
      }
    });
  });
}
