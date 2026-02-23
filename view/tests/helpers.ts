import type { Page, Locator } from "@playwright/test";

/** Get all workspace group elements in the sidebar. */
export function getSidebarWorkspaces(page: Page): Locator {
  return page.locator(".workspace-group");
}

/** Get all project row elements in the sidebar. */
export function getProjectRows(page: Page): Locator {
  return page.locator(".project-row");
}

/** Get the main content area. */
export function getMainContent(page: Page): Locator {
  return page.locator("#main-content");
}

/** Get a project row by project name text. */
export function getProjectRowByName(page: Page, name: string): Locator {
  return page.locator(".project-row", { hasText: name });
}

/** Get the sidebar element. */
export function getSidebar(page: Page): Locator {
  return page.locator("#sidebar");
}

/** Get workspace group header by workspace name. */
export function getWorkspaceGroup(page: Page, workspaceName: string): Locator {
  return page.locator(".workspace-group", { hasText: workspaceName });
}
