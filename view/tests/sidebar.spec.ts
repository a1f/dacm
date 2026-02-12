import { test, expect } from "./fixtures.ts";
import { getSidebarProjects, getTaskRows, getTaskRowByName } from "./helpers.ts";

test.describe("Sidebar", () => {
  test("renders all 3 project groups", async ({ dacmPage }) => {
    const groups = getSidebarProjects(dacmPage);
    await expect(groups).toHaveCount(3);
  });

  test("shows project names", async ({ dacmPage }) => {
    await expect(dacmPage.locator(".project-group-name").nth(0)).toHaveText("web-app");
    await expect(dacmPage.locator(".project-group-name").nth(1)).toHaveText("api-server");
    await expect(dacmPage.locator(".project-group-name").nth(2)).toHaveText("mobile-client");
  });

  test("renders task rows with correct count", async ({ dacmPage }) => {
    const rows = getTaskRows(dacmPage);
    await expect(rows).toHaveCount(5);
  });

  test("task rows show status indicators", async ({ dacmPage }) => {
    // "Add authentication flow" is running
    const runningRow = getTaskRowByName(dacmPage, "Add authentication flow");
    await expect(runningRow.locator(".status-running")).toBeVisible();

    // "Fix pagination bug" is waiting
    const waitingRow = getTaskRowByName(dacmPage, "Fix pagination bug");
    await expect(waitingRow.locator(".status-waiting")).toBeVisible();

    // "Database migration to v2" is completed
    const completedRow = getTaskRowByName(dacmPage, "Database migration to v2");
    await expect(completedRow.locator(".status-completed")).toBeVisible();
  });

  test("clicking a task selects it", async ({ dacmPage }) => {
    const row = getTaskRowByName(dacmPage, "Fix pagination bug");
    await row.click();
    await expect(row).toHaveClass(/task-row--selected/);
  });

  test("DACM header is visible", async ({ dacmPage }) => {
    await expect(dacmPage.locator(".sidebar-title")).toHaveText("DACM");
  });

  test("hamburger menu toggles dropdown", async ({ dacmPage }) => {
    const dropdown = dacmPage.locator("#menu-dropdown");
    await expect(dropdown).toHaveClass(/hidden/);

    await dacmPage.locator("#hamburger-btn").click();
    await expect(dropdown).not.toHaveClass(/hidden/);
  });
});
