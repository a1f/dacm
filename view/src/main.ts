import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./style.css";

interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
}

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>DACM</h1>
  <div class="toolbar">
    <button id="add-project">Add Project Folder</button>
  </div>
  <div id="project-list"></div>
  <p id="status"></p>
`;

const projectList = document.querySelector<HTMLDivElement>("#project-list")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

function showStatus(message: string, isError = false) {
  status.textContent = message;
  status.className = isError ? "error" : "";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderProjects(projects: Project[]) {
  if (projects.length === 0) {
    projectList.innerHTML = `<p class="empty">No projects yet. Click "Add Project Folder" to get started.</p>`;
    return;
  }

  projectList.innerHTML = projects
    .map(
      (p) => `
    <div class="project-row" data-id="${p.id}">
      <div class="project-info">
        <span class="project-name">${escapeHtml(p.name)}</span>
        <span class="project-path">${escapeHtml(p.path)}</span>
      </div>
      <button class="delete-btn" data-id="${p.id}">Remove</button>
    </div>
  `
    )
    .join("");
}

async function loadProjects() {
  try {
    const projects = await invoke<Project[]>("list_projects");
    renderProjects(projects);
  } catch (e) {
    showStatus(`Failed to load projects: ${e}`, true);
  }
}

async function addProject() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Folder",
    });

    if (!selected) return;

    const project = await invoke<Project>("add_project", { path: selected });
    showStatus(`Added "${project.name}"`);
    await loadProjects();
  } catch (e) {
    showStatus(`Failed to add project: ${e}`, true);
  }
}

async function removeProject(id: number) {
  try {
    await invoke("remove_project", { id });
    showStatus("Project removed");
    await loadProjects();
  } catch (e) {
    showStatus(`Failed to remove project: ${e}`, true);
  }
}

document.querySelector("#add-project")!.addEventListener("click", addProject);

projectList.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("delete-btn")) {
    const id = Number(target.dataset.id);
    removeProject(id);
  }
});

loadProjects();
