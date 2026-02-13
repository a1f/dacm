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
    const runningRow = getTaskRowByName(dacmPage, "Add authentication flow");
    await expect(runningRow.locator(".status-running")).toBeVisible();

    const waitingRow = getTaskRowByName(dacmPage, "Fix pagination bug");
    await expect(waitingRow.locator(".status-waiting")).toBeVisible();

    const completedRow = getTaskRowByName(dacmPage, "Database migration to v2");
    await expect(completedRow.locator(".status-completed")).toBeVisible();
  });

  test("clicking a task selects it", async ({ dacmPage }) => {
    const row = getTaskRowByName(dacmPage, "Fix pagination bug");
    await row.click();
    await expect(row).toHaveClass(/task-row--selected/);
  });

  test("new thread button is visible", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#new-thread-btn")).toBeVisible();
    await expect(dacmPage.locator("#new-thread-btn")).toContainText("New task");
  });

  test("gear button is visible at bottom", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#sidebar-gear-btn")).toBeVisible();
  });

  test("project groups have tree chevrons", async ({ dacmPage }) => {
    const chevrons = dacmPage.locator(".tree-chevron");
    await expect(chevrons.first()).toBeVisible();
  });

  test("task rows show age labels", async ({ dacmPage }) => {
    const ages = dacmPage.locator(".task-age");
    await expect(ages.first()).toBeVisible();
  });

  test("clicking project header collapses tasks", async ({ dacmPage }) => {
    const header = dacmPage.locator(".project-group-header").first();
    const group = dacmPage.locator(".project-group").first();

    // Initially tasks are visible
    const tasksBefore = group.locator(".task-row");
    const countBefore = await tasksBefore.count();
    expect(countBefore).toBeGreaterThan(0);

    // Click to collapse
    await header.click();
    const tasksAfter = group.locator(".task-row");
    await expect(tasksAfter).toHaveCount(0);

    // Click to expand again
    await header.click();
    await expect(group.locator(".task-row")).toHaveCount(countBefore);
  });
});
