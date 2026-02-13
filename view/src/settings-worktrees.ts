import { getSetting, setSetting } from "./settings-api.ts";

async function loadSetting(key: string, fallback: string): Promise<string> {
  try {
    return await getSetting(key);
  } catch {
    return fallback;
  }
}

export async function renderWorktreeSettings(container: HTMLElement): Promise<void> {
  const [basePath, branchPattern] = await Promise.all([
    loadSetting("worktree_base_path", ""),
    loadSetting("worktree_branch_pattern", "feature/{task_name}"),
  ]);

  container.innerHTML = `
    <div class="settings-page">
      <h2 class="settings-page-title">Worktrees</h2>

      <div class="settings-section">
        <div class="settings-section-title">Git Worktree Configuration</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Base path</div>
            <div class="settings-row-sublabel">Directory where worktrees are created</div>
          </div>
          <input type="text" class="settings-input" id="worktree-base-path" value="${escapeAttr(basePath)}" placeholder="/path/to/worktrees" />
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Branch pattern</div>
            <div class="settings-row-sublabel">Use {task_name} as placeholder</div>
          </div>
          <input type="text" class="settings-input" id="worktree-branch-pattern" value="${escapeAttr(branchPattern)}" placeholder="feature/{task_name}" />
        </div>
      </div>
    </div>`;

  container.querySelector("#worktree-base-path")?.addEventListener("change", (e) => {
    setSetting("worktree_base_path", (e.target as HTMLInputElement).value);
  });

  container.querySelector("#worktree-branch-pattern")?.addEventListener("change", (e) => {
    setSetting("worktree_branch_pattern", (e.target as HTMLInputElement).value);
  });
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
