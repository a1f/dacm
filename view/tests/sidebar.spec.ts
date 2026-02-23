import { test, expect } from "./fixtures.ts";
import { getSidebarWorkspaces, getProjectRows, getProjectRowByName } from "./helpers.ts";

test.describe("Sidebar", () => {
  test("renders all 3 workspace groups", async ({ dacmPage }) => {
    const groups = getSidebarWorkspaces(dacmPage);
    await expect(groups).toHaveCount(3);
  });

  test("shows workspace names", async ({ dacmPage }) => {
    await expect(dacmPage.locator(".workspace-group-name").nth(0)).toHaveText("web-app");
    await expect(dacmPage.locator(".workspace-group-name").nth(1)).toHaveText("api-server");
    await expect(dacmPage.locator(".workspace-group-name").nth(2)).toHaveText("mobile-client");
  });

  test("renders project rows with correct count", async ({ dacmPage }) => {
    const rows = getProjectRows(dacmPage);
    await expect(rows).toHaveCount(5);
  });

  test("project rows show status indicators", async ({ dacmPage }) => {
    const runningRow = getProjectRowByName(dacmPage, "Add authentication flow");
    await expect(runningRow.locator(".status-running")).toBeVisible();

    const waitingRow = getProjectRowByName(dacmPage, "Fix pagination bug");
    await expect(waitingRow.locator(".status-waiting")).toBeVisible();

    const completedRow = getProjectRowByName(dacmPage, "Database migration to v2");
    await expect(completedRow.locator(".status-completed")).toBeVisible();
  });

  test("clicking a project selects it", async ({ dacmPage }) => {
    const row = getProjectRowByName(dacmPage, "Fix pagination bug");
    await row.click();
    await expect(row).toHaveClass(/project-row--selected/);
  });

  test("new thread button is visible", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#new-thread-btn")).toBeVisible();
    await expect(dacmPage.locator("#new-thread-btn")).toContainText("New project");
  });

  test("gear button is visible at bottom", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#sidebar-gear-btn")).toBeVisible();
  });

  test("workspace groups have tree chevrons", async ({ dacmPage }) => {
    const chevrons = dacmPage.locator(".tree-chevron");
    await expect(chevrons.first()).toBeVisible();
  });

  test("project rows show age labels", async ({ dacmPage }) => {
    const ages = dacmPage.locator(".project-age");
    await expect(ages.first()).toBeVisible();
  });

  test("clicking workspace header collapses projects", async ({ dacmPage }) => {
    const header = dacmPage.locator(".workspace-group-header").first();
    const group = dacmPage.locator(".workspace-group").first();

    // Initially projects are visible
    const projectsBefore = group.locator(".project-row");
    const countBefore = await projectsBefore.count();
    expect(countBefore).toBeGreaterThan(0);

    // Click to collapse
    await header.click();
    const projectsAfter = group.locator(".project-row");
    await expect(projectsAfter).toHaveCount(0);

    // Click to expand again
    await header.click();
    await expect(group.locator(".project-row")).toHaveCount(countBefore);
  });
});
