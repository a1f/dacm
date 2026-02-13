import { test, expect } from "./fixtures.ts";
import { getSidebar } from "./helpers.ts";

test.describe("Layout Redesign", () => {
  test("no DACM header in sidebar", async ({ dacmPage }) => {
    await expect(dacmPage.locator(".sidebar-header")).toHaveCount(0);
    await expect(dacmPage.locator(".sidebar-title")).toHaveCount(0);
  });

  test("new thread button is present at top", async ({ dacmPage }) => {
    const btn = dacmPage.locator("#new-thread-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("New task");
  });

  test("gear icon is at bottom of sidebar", async ({ dacmPage }) => {
    const gear = dacmPage.locator("#sidebar-gear-btn");
    await expect(gear).toBeVisible();

    // Gear should be inside sidebar-bottom
    const parent = dacmPage.locator(".sidebar-bottom #sidebar-gear-btn");
    await expect(parent).toBeVisible();
  });

  test("tree chevrons are visible on project headers", async ({ dacmPage }) => {
    const chevrons = dacmPage.locator(".project-group-header .tree-chevron");
    const count = await chevrons.count();
    expect(count).toBe(3);
  });

  test("folder icons are visible on project headers", async ({ dacmPage }) => {
    const icons = dacmPage.locator(".project-group-header .tree-folder-icon");
    const count = await icons.count();
    expect(count).toBe(3);
  });

  test("age labels render on task rows", async ({ dacmPage }) => {
    const ages = dacmPage.locator(".task-age");
    const count = await ages.count();
    expect(count).toBeGreaterThan(0);

    // Verify first age label has content (e.g. "1d", "3d", "1mo")
    const text = await ages.first().textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);
  });

  test("sidebar toggle hides sidebar", async ({ dacmPage }) => {
    const sidebar = getSidebar(dacmPage);
    const hideBtn = dacmPage.locator("#sidebar-hide-btn");

    // Initially visible
    const boxBefore = await sidebar.boundingBox();
    expect(boxBefore!.width).toBe(280);

    await hideBtn.click();

    // After toggle, sidebar collapses
    await expect(sidebar).toHaveClass(/sidebar--collapsed/);
  });

  test("sidebar toggle button becomes visible when sidebar is hidden", async ({ dacmPage }) => {
    const toggleBtn = dacmPage.locator("#sidebar-toggle-btn");

    // Initially hidden (opacity 0, pointer-events none)
    await expect(toggleBtn).not.toHaveClass(/sidebar-toggle-btn--visible/);

    // Collapse sidebar
    await dacmPage.locator("#sidebar-hide-btn").click();

    // Toggle button should be visible
    await expect(toggleBtn).toHaveClass(/sidebar-toggle-btn--visible/);

    // Click it to restore sidebar
    await toggleBtn.click();
    const sidebar = getSidebar(dacmPage);
    await expect(sidebar).not.toHaveClass(/sidebar--collapsed/);
  });

  test("right-click on project shows context menu", async ({ dacmPage }) => {
    const header = dacmPage.locator(".project-group-header").first();
    await header.click({ button: "right" });
    await expect(dacmPage.locator(".context-menu")).toBeVisible();
    await expect(dacmPage.locator(".context-menu-item")).toContainText("Remove");
  });
});
