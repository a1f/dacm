import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { renderSidebar, triggerRenameSelected } from "./sidebar.ts";
import { renderProjectDetail, destroyTerminalForSession, detachActiveTerminal } from "./project-detail.ts";
import { renderToolbar } from "./toolbar.ts";
import { clearStream, markStreamStarted, isSessionActive, hasReceivedOutput } from "./terminal.ts";
import { renderDebugPanel } from "./debug-panel.ts";
import { togglePerfOverlay } from "./perf-overlay.ts";
import { renderSettingsNav } from "./settings-nav.ts";
import { renderGeneralSettings } from "./settings-general.ts";
import { renderWorktreeSettings } from "./settings-worktrees.ts";
import { renderArchivedSettings } from "./settings-archived.ts";
import { initTheme } from "./theme.ts";
import { getSetting, setSetting } from "./settings-api.ts";
import type { Workspace, Project, ProjectStatus, ProjectStatusChangedEvent, SessionInfo, SettingsPage } from "./types.ts";
import { DEFAULT_CLI, DEFAULT_MODEL_ID } from "./constants.ts";
import { findModel } from "./utils.ts";
import "./style.css";

interface AppState {
  workspaces: Workspace[];
  projects: Project[];
  selectedProjectId: number | null;
  selectedWorkspaceId: number | null;
  selectedModelId: string;
  autoSpawning: boolean;
  activeSessions: Map<number, string>; // projectId -> sessionId
  sessionUnlisteners: Map<number, () => void>; // projectId -> unlisten function
  debugMode: boolean;
  sidebarCollapsed: boolean;
  view: "projects" | "settings";
  settingsPage: SettingsPage;
}

const state: AppState = {
  workspaces: [],
  projects: [],
  selectedProjectId: null,
  selectedWorkspaceId: null,
  selectedModelId: DEFAULT_MODEL_ID,
  autoSpawning: false,
  activeSessions: new Map(),
  sessionUnlisteners: new Map(),
  debugMode: false,
  sidebarCollapsed: false,
  view: "projects",
  settingsPage: "general",
};

const SIDEBAR_TOGGLE_ICON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="layout">
    <div class="titlebar-drag-region" data-tauri-drag-region></div>
    <aside class="sidebar" id="sidebar"></aside>
    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" title="Toggle sidebar (Cmd+B)">
      ${SIDEBAR_TOGGLE_ICON}
    </button>
    <main class="main-content" id="main-content"></main>
  </div>
`;

const sidebarEl = document.querySelector<HTMLElement>("#sidebar")!;
const mainContentEl = document.querySelector<HTMLElement>("#main-content")!;
const sidebarToggleBtn = document.querySelector<HTMLElement>("#sidebar-toggle-btn")!;

function getSelectedProject(): Project | null {
  if (state.selectedProjectId === null) return null;
  return state.projects.find((p) => p.id === state.selectedProjectId) ?? null;
}

function getWorkspacePath(workspaceId: number): string | null {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  return workspace?.path ?? null;
}

function toggleSidebar(): void {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  sidebarEl.classList.toggle("sidebar--collapsed", state.sidebarCollapsed);
  sidebarToggleBtn.classList.toggle("sidebar-toggle-btn--visible", state.sidebarCollapsed);
}

async function handleModelChange(modelId: string): Promise<void> {
  state.selectedModelId = modelId;
  setSetting("selected_model_id", modelId);

  if (state.selectedProjectId !== null) {
    const project = getSelectedProject();
    if (project) {
      const sessionId = state.activeSessions.get(project.id);
      if (sessionId) {
        try { await invoke("kill_session", { sessionId }); } catch {}
        const unlisten = state.sessionUnlisteners.get(project.id);
        if (unlisten) { unlisten(); state.sessionUnlisteners.delete(project.id); }
        destroyTerminalForSession(sessionId);
        state.activeSessions.delete(project.id);
        clearStream(sessionId);
      }
      await spawnSessionForProject(project);
      render();
      return;
    }
  }
  render();
}

async function handleWorkspaceChange(newWorkspaceId: number): Promise<void> {
  if (newWorkspaceId === state.selectedWorkspaceId && state.selectedProjectId !== null) return;

  state.autoSpawning = false;
  if (state.selectedProjectId !== null) {
    await killSessionForProject(state.selectedProjectId);
  }
  state.selectedWorkspaceId = newWorkspaceId;

  const workspaceProjects = state.projects.filter((p) => p.workspace_id === newWorkspaceId);
  const running = workspaceProjects.find((p) => p.status === "running");
  const best = running ?? workspaceProjects[0] ?? null;
  state.selectedProjectId = best?.id ?? null;

  setSetting("last_workspace_id", String(newWorkspaceId));
  render();
}

async function autoSpawnNewProject(workspaceId: number): Promise<void> {
  if (state.autoSpawning) return;

  state.autoSpawning = true;
  state.selectedWorkspaceId = workspaceId;
  state.selectedProjectId = null;
  render();

  try {
    const now = new Date();
    const name = `Chat ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

    const newProject = await invoke<Project>("create_project", {
      workspaceId,
      name,
      description: "",
    });
    if (!state.autoSpawning) return;
    state.projects.push(newProject);
    state.selectedProjectId = newProject.id;
    state.selectedWorkspaceId = workspaceId;
    setSetting("last_project_id", String(newProject.id));
    render();
    if (!state.autoSpawning) return;
    await spawnSessionForProject(newProject);
    render();
  } catch (e) {
    console.error("Failed to auto-spawn session:", e);
  } finally {
    state.autoSpawning = false;
  }
}

async function spawnSessionForProject(project: Project): Promise<void> {
  const path = getWorkspacePath(project.workspace_id);
  if (!path) return;

  try {
    const model = findModel(state.selectedModelId);
    const cliCommand = model?.interface ?? DEFAULT_CLI;

    const sessionId = await invoke<string>("spawn_session", {
      projectId: project.id,
      workspaceId: project.workspace_id,
      workingDir: path,
      initialPrompt: project.description || null,
      cliCommand,
      model: state.selectedModelId,
    });
    state.activeSessions.set(project.id, sessionId);

    const unlisten = await listen<void>(`session-exit-${sessionId}`, async () => {
      const unsub = state.sessionUnlisteners.get(project.id);
      if (unsub) { unsub(); state.sessionUnlisteners.delete(project.id); }

      destroyTerminalForSession(sessionId);
      state.activeSessions.delete(project.id);
      clearStream(sessionId);

      try {
        await invoke<Project>("archive_project", { projectId: project.id });
      } catch (_e) {
        // Project may have been archived already
      }
      state.projects = state.projects.filter((p) => p.id !== project.id);
      if (state.selectedProjectId === project.id) {
        const siblings = state.projects.filter((p) => p.workspace_id === project.workspace_id);
        state.selectedProjectId = siblings[0]?.id ?? null;
      }
      render();
    });
    state.sessionUnlisteners.set(project.id, unlisten);

    if (project.status !== "running") {
      const updated = await invoke<Project>("update_project_status", {
        projectId: project.id,
        status: "running",
      });
      state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
    }
  } catch (e) {
    console.error("Failed to spawn session:", e);
  }
}

async function killSessionForProject(projectId: number): Promise<void> {
  const sessionId = state.activeSessions.get(projectId);
  if (!sessionId) return;

  try {
    await invoke("kill_session", { sessionId });
  } catch (e) {
    console.error("Failed to kill session:", e);
  }

  const unlisten = state.sessionUnlisteners.get(projectId);
  if (unlisten) {
    unlisten();
    state.sessionUnlisteners.delete(projectId);
  }

  destroyTerminalForSession(sessionId);
  state.activeSessions.delete(projectId);
  clearStream(sessionId);

  const archivedWorkspaceId = state.projects.find((p) => p.id === projectId)?.workspace_id;
  try {
    await invoke<Project>("archive_project", { projectId });
  } catch (e) {
    console.error("Failed to archive project:", e);
  }
  state.projects = state.projects.filter((p) => p.id !== projectId);
  if (state.selectedProjectId === projectId) {
    const siblings = archivedWorkspaceId
      ? state.projects.filter((p) => p.workspace_id === archivedWorkspaceId)
      : [];
    state.selectedProjectId = siblings[0]?.id ?? null;
  }
}

function renderSettingsView(): void {
  renderSettingsNav(sidebarEl, state.settingsPage, {
    onBack() {
      state.view = "projects";
      render();
    },
    onPageSelect(page: SettingsPage) {
      state.settingsPage = page;
      render();
    },
  });

  detachActiveTerminal(mainContentEl);
  mainContentEl.classList.remove("terminal-mode");

  switch (state.settingsPage) {
    case "general":
      renderGeneralSettings(mainContentEl, {
        async onPreventSleepChange(prevent: boolean) {
          try {
            await invoke("set_prevent_sleep", { prevent });
          } catch (e) {
            console.error("Failed to set prevent sleep:", e);
          }
        },
      });
      break;
    case "worktrees":
      renderWorktreeSettings(mainContentEl);
      break;
    case "archived":
      renderArchivedSettings(mainContentEl, state.workspaces, {
        async onRestore(projectId: number) {
          try {
            const updated = await invoke<Project>("update_project_status", { projectId, status: "waiting" });
            state.projects.push(updated);
            render();
          } catch (e) {
            console.error("Failed to restore project:", e);
          }
        },
        async onDelete(projectId: number) {
          try {
            await invoke("delete_project", { projectId });
            render();
          } catch (e) {
            console.error("Failed to delete project:", e);
          }
        },
      });
      break;
  }
}

function getSidebarCallbacks(): import("./sidebar.ts").SidebarCallbacks {
  return {
    onProjectSelect(projectId: number) {
      state.selectedProjectId = projectId;
      state.debugMode = false;
      setSetting("last_project_id", String(projectId));
      render();
    },
    async onRenameProject(projectId: number, name: string) {
      try {
        const updated = await invoke<Project>("rename_project", { projectId, name });
        state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
        render();
      } catch (e) {
        console.error("Failed to rename project:", e);
      }
    },
    async onNewThread() {
      state.debugMode = false;
      const workspaceId = state.selectedWorkspaceId ?? state.workspaces[0]?.id;
      if (workspaceId) {
        await autoSpawnNewProject(workspaceId);
      }
    },
    async onNewProjectForWorkspace(workspaceId: number) {
      if (state.selectedProjectId !== null && workspaceId !== state.selectedWorkspaceId) {
        await killSessionForProject(state.selectedProjectId);
      }
      state.debugMode = false;
      setSetting("last_workspace_id", String(workspaceId));
      await autoSpawnNewProject(workspaceId);
    },
    async onAddWorkspace() {
      try {
        const selected = await open({ directory: true, multiple: false });
        if (!selected) return;
        await invoke("add_workspace", { path: selected });
        await refresh();
      } catch (e) {
        console.error("Failed to add workspace:", e);
      }
    },
    async onArchiveProject(projectId: number) {
      try {
        await invoke<Project>("archive_project", { projectId });
        const unlisten = state.sessionUnlisteners.get(projectId);
        if (unlisten) { unlisten(); state.sessionUnlisteners.delete(projectId); }
        const sessionId = state.activeSessions.get(projectId);
        if (sessionId) {
          destroyTerminalForSession(sessionId);
          clearStream(sessionId);
        }
        state.activeSessions.delete(projectId);
        const archivedWorkspaceId = state.projects.find((p) => p.id === projectId)?.workspace_id;
        state.projects = state.projects.filter((p) => p.id !== projectId);
        if (state.selectedProjectId === projectId) {
          const siblings = archivedWorkspaceId
            ? state.projects.filter((p) => p.workspace_id === archivedWorkspaceId)
            : [];
          state.selectedProjectId = siblings[0]?.id ?? null;
        }
        render();
      } catch (e) {
        console.error("Failed to archive project:", e);
      }
    },
    onToggleSidebar() {
      toggleSidebar();
    },
    onOpenSettings() {
      state.view = "settings";
      state.debugMode = false;
      render();
    },
    async onRemoveWorkspace(workspaceId: number) {
      try {
        await invoke("remove_workspace", { id: workspaceId });
        state.projects = state.projects.filter((p) => p.workspace_id !== workspaceId);
        if (state.selectedProjectId !== null) {
          const selected = state.projects.find((p) => p.id === state.selectedProjectId);
          if (!selected) state.selectedProjectId = null;
        }
        await refresh();
      } catch (e) {
        console.error("Failed to remove workspace:", e);
      }
    },
  };
}

function refreshSidebar(): void {
  renderSidebar(sidebarEl, state.workspaces, state.projects, state.selectedProjectId, getSidebarCallbacks());
}

function render() {
  if (state.view === "settings") {
    renderSettingsView();
    return;
  }

  refreshSidebar();

  if (state.debugMode) {
    mainContentEl.classList.remove("terminal-mode");
    detachActiveTerminal(mainContentEl);
    renderDebugPanel(mainContentEl, state.projects, {
      onClose() {
        state.debugMode = false;
        render();
      },
      onGoToProject(projectId: number) {
        state.selectedProjectId = projectId;
        state.debugMode = false;
        render();
      },
      async onKillSession(sessionId: string) {
        let targetProjectId: number | null = null;
        for (const [projectId, sid] of state.activeSessions) {
          if (sid === sessionId) {
            targetProjectId = projectId;
            break;
          }
        }
        if (targetProjectId !== null) {
          await killSessionForProject(targetProjectId);
        }
        render();
      },
    });
    return;
  }

  const project = getSelectedProject();

  if (!project) {
    detachActiveTerminal(mainContentEl);
    mainContentEl.classList.add("terminal-mode");

    if (state.workspaces.length === 0) {
      mainContentEl.innerHTML = `
        <div class="session-header" data-tauri-drag-region></div>
        <div class="no-session-body">
          <div class="no-session-message">
            <span class="no-session-label">No workspaces configured</span>
            <button class="btn btn-restart" id="btn-add-workspace">Add a workspace</button>
          </div>
        </div>`;
      mainContentEl.querySelector("#btn-add-workspace")?.addEventListener("click", async () => {
        try {
          const selected = await open({ directory: true, multiple: false });
          if (!selected) return;
          await invoke("add_workspace", { path: selected });
          await refresh();
        } catch (e) {
          console.error("Failed to add workspace:", e);
        }
      });
      renderToolbar(mainContentEl, {
        selectedModelId: state.selectedModelId,
        selectedWorkspace: null,
        workspaces: [],
        branchName: null,
      }, {
        async onModelChange(modelId: string) {
          await handleModelChange(modelId);
        },
        async onWorkspaceChange() {},
        async onAddWorkspace() {
          try {
            const selected = await open({ directory: true, multiple: false });
            if (!selected) return;
            await invoke("add_workspace", { path: selected });
            await refresh();
          } catch (e) {
            console.error("Failed to add workspace:", e);
          }
        },
      });
      return;
    }

    if (state.autoSpawning) {
      const selectedWorkspace = state.workspaces.find((w) => w.id === state.selectedWorkspaceId) ?? null;
      mainContentEl.innerHTML = `
        <div class="session-header" data-tauri-drag-region>
          <span class="session-header-title">Starting session\u2026</span>
        </div>
        <div class="no-session-body">
          <div class="no-session-message">
            <span class="no-session-label">Starting session\u2026</span>
          </div>
        </div>`;
      renderToolbar(mainContentEl, {
        selectedModelId: state.selectedModelId,
        selectedWorkspace,
        workspaces: state.workspaces,
        branchName: null,
      }, {
        async onModelChange(modelId: string) {
          await handleModelChange(modelId);
        },
        async onWorkspaceChange(newWorkspaceId: number) {
          await handleWorkspaceChange(newWorkspaceId);
        },
        async onAddWorkspace() {
          try {
            const selected = await open({ directory: true, multiple: false });
            if (!selected) return;
            await invoke("add_workspace", { path: selected });
            await refresh();
          } catch (e) {
            console.error("Failed to add workspace:", e);
          }
        },
      });
      return;
    }

    const workspaceId = state.selectedWorkspaceId ?? state.workspaces[0]?.id;
    const selectedWorkspace = workspaceId ? state.workspaces.find((w) => w.id === workspaceId) ?? null : null;
    mainContentEl.innerHTML = `
      <div class="session-header" data-tauri-drag-region></div>
      <div class="no-session-body">
        <div class="no-session-message">
          <span class="no-session-label">No active session</span>
          <button class="btn btn-restart" id="btn-new-session">New session</button>
        </div>
      </div>`;
    mainContentEl.querySelector("#btn-new-session")?.addEventListener("click", async () => {
      const wid = state.selectedWorkspaceId ?? state.workspaces[0]?.id;
      if (wid) await autoSpawnNewProject(wid);
    });
    renderToolbar(mainContentEl, {
      selectedModelId: state.selectedModelId,
      selectedWorkspace,
      workspaces: state.workspaces,
      branchName: null,
    }, {
      async onModelChange(modelId: string) {
        await handleModelChange(modelId);
      },
      async onWorkspaceChange(newWorkspaceId: number) {
        await handleWorkspaceChange(newWorkspaceId);
      },
      async onAddWorkspace() {
        try {
          const selected = await open({ directory: true, multiple: false });
          if (!selected) return;
          await invoke("add_workspace", { path: selected });
          await refresh();
        } catch (e) {
          console.error("Failed to add workspace:", e);
        }
      },
    });
    return;
  }

  const activeSessionId = state.activeSessions.get(project.id) ?? null;
  const selectedWorkspace = state.workspaces.find((w) => w.id === project.workspace_id) ?? null;
  const toolbarProps = {
    selectedModelId: state.selectedModelId,
    selectedWorkspace,
    workspaces: state.workspaces,
    branchName: project.branch_name,
  };

  renderProjectDetail(mainContentEl, project, activeSessionId, toolbarProps, {
    async onStatusChange(projectId: number, status: ProjectStatus) {
      try {
        const updated = await invoke<Project>("update_project_status", { projectId, status });
        state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
        render();
      } catch (e) {
        console.error("Failed to update status:", e);
      }
    },
    async onSimulate(projectId: number) {
      try {
        await invoke("simulate_project", { projectId });
      } catch (e) {
        console.error("Failed to start simulation:", e);
      }
    },
    async onArchive(projectId: number) {
      try {
        await invoke<Project>("archive_project", { projectId });
        const unlisten = state.sessionUnlisteners.get(projectId);
        if (unlisten) {
          unlisten();
          state.sessionUnlisteners.delete(projectId);
        }
        const sessionId = state.activeSessions.get(projectId);
        if (sessionId) {
          destroyTerminalForSession(sessionId);
          clearStream(sessionId);
        }
        state.activeSessions.delete(projectId);
        const archivedWorkspaceId = state.projects.find((p) => p.id === projectId)?.workspace_id;
        state.projects = state.projects.filter((p) => p.id !== projectId);
        if (state.selectedProjectId === projectId) {
          const siblings = archivedWorkspaceId
            ? state.projects.filter((p) => p.workspace_id === archivedWorkspaceId)
            : [];
          state.selectedProjectId = siblings[0]?.id ?? null;
        }
        render();
      } catch (e) {
        console.error("Failed to archive project:", e);
      }
    },
    async onKillSession(projectId: number) {
      await killSessionForProject(projectId);
      render();
    },
    async onRestartSession(projectId: number) {
      const oldSessionId = state.activeSessions.get(projectId);
      if (oldSessionId) {
        destroyTerminalForSession(oldSessionId);
        state.activeSessions.delete(projectId);
        clearStream(oldSessionId);
      }
      const p = state.projects.find((p) => p.id === projectId);
      if (p) {
        await spawnSessionForProject(p);
        render();
      }
    },
    async onModelChange(modelId: string) {
      await handleModelChange(modelId);
    },
    async onWorkspaceChange(workspaceId: number) {
      await handleWorkspaceChange(workspaceId);
    },
    async onAddWorkspace() {
      try {
        const selected = await open({ directory: true, multiple: false });
        if (!selected) return;
        await invoke("add_workspace", { path: selected });
        await refresh();
      } catch (e) {
        console.error("Failed to add workspace:", e);
      }
    },
  });
}

async function loadCodeFontSettings(): Promise<void> {
  try {
    const family = await getSetting("code_font_family");
    if (family) document.documentElement.style.setProperty("--code-font-family", family);
  } catch { /* use default */ }
  try {
    const size = await getSetting("code_font_size");
    if (size) document.documentElement.style.setProperty("--code-font-size", size + "px");
  } catch { /* use default */ }
}

async function refresh() {
  try {
    const [workspaces, projects, sessions] = await Promise.all([
      invoke<Workspace[]>("list_workspaces"),
      invoke<Project[]>("list_all_projects"),
      invoke<SessionInfo[]>("list_sessions"),
    ]);
    state.workspaces = workspaces;
    state.projects = projects;

    const runningSessionProjectIds = new Set(
      sessions.filter((s) => s.status === "running").map((s) => s.project_id),
    );

    for (const s of sessions) {
      if (s.status === "running" && !state.activeSessions.has(s.project_id)) {
        state.activeSessions.set(s.project_id, s.session_id);
        markStreamStarted(s.session_id);
      }
    }

    for (const project of state.projects) {
      if (project.status === "running" && !runningSessionProjectIds.has(project.id)) {
        try {
          const updated = await invoke<Project>("update_project_status", {
            projectId: project.id,
            status: "completed",
          });
          state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
        } catch { /* ignore */ }
      }
    }

    render();
  } catch (e) {
    console.error("Failed to load data:", e);
  }
}

listen<ProjectStatusChangedEvent>("project-status-changed", (event) => {
  const { project_id, status } = event.payload;
  state.projects = state.projects.map((p) =>
    p.id === project_id ? { ...p, status } : p,
  );
  render();
});

document.addEventListener("keydown", (e) => {
  const inTerminal = document.activeElement?.closest(".terminal-container") !== null;

  if (e.ctrlKey && e.shiftKey && e.key === "D") {
    e.preventDefault();
    state.debugMode = !state.debugMode;
    render();
    return;
  }

  if (e.ctrlKey && e.shiftKey && e.key === "P") {
    e.preventDefault();
    togglePerfOverlay();
    return;
  }

  const mod = e.metaKey || e.ctrlKey;

  if (mod && e.key === "e") {
    e.preventDefault();
    triggerRenameSelected(sidebarEl, state.selectedProjectId, getSidebarCallbacks());
    return;
  }

  if (inTerminal) return;

  if (mod && e.key === "b") {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  if (mod && e.key === ",") {
    e.preventDefault();
    if (state.view === "settings") {
      state.view = "projects";
    } else {
      state.view = "settings";
      state.debugMode = false;
    }
    render();
    return;
  }

  if (mod && e.key === "n") {
    e.preventDefault();
    state.debugMode = false;
    if (state.view === "settings") {
      state.view = "projects";
    }
    const wid = state.selectedWorkspaceId ?? state.workspaces[0]?.id;
    if (wid) autoSpawnNewProject(wid);
    return;
  }

  if (e.key === "Escape") {
    if (state.view === "settings") {
      e.preventDefault();
      state.view = "projects";
      render();
      return;
    }
    if (state.debugMode) {
      e.preventDefault();
      state.debugMode = false;
      render();
      return;
    }
    if (state.selectedProjectId !== null) {
      e.preventDefault();
      state.selectedProjectId = null;
      render();
      return;
    }
  }
});

sidebarToggleBtn.addEventListener("click", toggleSidebar);

async function loadPersistedState(): Promise<void> {
  try {
    const workspaceId = await getSetting("last_workspace_id");
    const id = Number(workspaceId);
    if (state.workspaces.some((w) => w.id === id)) {
      state.selectedWorkspaceId = id;
    }
  } catch { /* no persisted workspace */ }

  try {
    const modelId = await getSetting("selected_model_id");
    if (findModel(modelId)) {
      state.selectedModelId = modelId;
    }
  } catch { /* no persisted model */ }

  try {
    const projectId = await getSetting("last_project_id");
    const id = Number(projectId);
    if (state.projects.some((p) => p.id === id)) {
      state.selectedProjectId = id;
    }
  } catch { /* no persisted project */ }

  if (state.selectedWorkspaceId === null && state.workspaces.length > 0) {
    state.selectedWorkspaceId = state.workspaces[0].id;
  }
}

const IDLE_THRESHOLD_MS = 5000;
setInterval(() => {
  for (const [projectId, sessionId] of state.activeSessions) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) continue;

    const active = isSessionActive(sessionId, IDLE_THRESHOLD_MS);
    const received = hasReceivedOutput(sessionId);

    if (project.status === "running" && !active && received) {
      invoke<Project>("update_project_status", { projectId, status: "completed" })
        .then((updated) => {
          state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
          refreshSidebar();
        })
        .catch(() => {});
    } else if (project.status === "completed" && active) {
      invoke<Project>("update_project_status", { projectId, status: "running" })
        .then((updated) => {
          state.projects = state.projects.map((p) => (p.id === updated.id ? updated : p));
          refreshSidebar();
        })
        .catch(() => {});
    }
  }
}, 3000);

async function init(): Promise<void> {
  await initTheme();
  await Promise.all([refresh(), loadCodeFontSettings()]);
  await loadPersistedState();

  if (state.selectedProjectId === null && state.workspaces.length > 0) {
    const workspaceId = state.selectedWorkspaceId ?? state.workspaces[0].id;

    const workspaceProjects = state.projects.filter((p) => p.workspace_id === workspaceId);
    const running = workspaceProjects.find((p) => p.status === "running");
    const best = running ?? workspaceProjects[0] ?? null;

    if (best) {
      state.selectedProjectId = best.id;
      setSetting("last_project_id", String(best.id));
      render();
    } else {
      await autoSpawnNewProject(workspaceId);
    }
  } else {
    render();
  }
}

init();
