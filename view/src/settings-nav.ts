import type { SettingsPage } from "./types.ts";

export interface SettingsNavCallbacks {
  onBack: () => void;
  onPageSelect: (page: SettingsPage) => void;
}

const ARROW_LEFT = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12L6 8l4-4"/></svg>`;

const NAV_ITEMS: { page: SettingsPage; label: string }[] = [
  { page: "general", label: "General" },
  { page: "worktrees", label: "Worktrees" },
  { page: "archived", label: "Archived" },
];

export function renderSettingsNav(
  container: HTMLElement,
  activePage: SettingsPage,
  callbacks: SettingsNavCallbacks,
): void {
  const navItemsHtml = NAV_ITEMS.map(
    (item) => `
    <button class="settings-nav-item ${item.page === activePage ? "settings-nav-item--active" : ""}" data-page="${item.page}">
      ${item.label}
    </button>`,
  ).join("");

  container.innerHTML = `
    <div class="sidebar-titlebar"></div>
    <div class="sidebar-top">
      <button class="settings-nav-back" id="settings-nav-back">
        ${ARROW_LEFT}
        <span>Settings</span>
      </button>
    </div>
    <div class="settings-nav-list">
      ${navItemsHtml}
    </div>`;

  container.querySelector("#settings-nav-back")?.addEventListener("click", () => {
    callbacks.onBack();
  });

  container.querySelectorAll(".settings-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const page = (item as HTMLElement).dataset.page as SettingsPage;
      callbacks.onPageSelect(page);
    });
  });
}
