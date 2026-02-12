import type { Page, Locator } from "@playwright/test";

/** Get all project group elements in the sidebar. */
export function getSidebarProjects(page: Page): Locator {
  return page.locator(".project-group");
}

/** Get all task row elements in the sidebar. */
export function getTaskRows(page: Page): Locator {
  return page.locator(".task-row");
}

/** Get the main content area. */
export function getMainContent(page: Page): Locator {
  return page.locator("#main-content");
}

/** Get a task row by task name text. */
export function getTaskRowByName(page: Page, name: string): Locator {
  return page.locator(".task-row", { hasText: name });
}

/** Get the sidebar element. */
export function getSidebar(page: Page): Locator {
  return page.locator("#sidebar");
}

/** Get project group header by project name. */
export function getProjectGroup(page: Page, projectName: string): Locator {
  return page.locator(".project-group", { hasText: projectName });
}
