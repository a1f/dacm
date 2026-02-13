import { test, expect } from "./fixtures.ts";
import { getMainContent, getTaskRowByName } from "./helpers.ts";

test.describe("Integration Flows", () => {
  test("full flow: prompt -> task created -> detail view", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);

    // Start page visible
    await expect(main.locator(".start-page-title")).toBeVisible();

    // Type a prompt and submit
    const input = dacmPage.locator("#start-page-input");
    await input.fill("Implement user registration");
    await input.press("Enter");

    // Start page should disappear, task detail or terminal should appear
    await expect(main.locator(".start-page")).not.toBeVisible({ timeout: 3000 });

    // New task should appear in sidebar
    await expect(getTaskRowByName(dacmPage, "Implement user registration")).toBeVisible();
  });

  test("open settings -> change theme -> back -> theme persists", async ({ dacmPage }) => {
    // Open settings
    await dacmPage.locator("#sidebar-gear-btn").click();
    await dacmPage.locator("[data-action='settings']").click();
    await dacmPage.waitForSelector(".settings-page-title", { timeout: 3000 });

    // Change theme to light
    await dacmPage.locator(".segmented-btn", { hasText: "Light" }).click();
    const themeAfterSet = await dacmPage.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAfterSet).toBe("light");

    // Go back to app
    await dacmPage.locator(".settings-nav-back").click();
    await expect(dacmPage.locator(".start-page-title")).toBeVisible();

    // Theme should persist
    const themeAfterBack = await dacmPage.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAfterBack).toBe("light");
  });

  test("sidebar toggle -> hidden -> show -> layout correct", async ({ dacmPage }) => {
    const sidebar = dacmPage.locator("#sidebar");
    const toggleBtn = dacmPage.locator("#sidebar-toggle-btn");

    // Sidebar initially visible
    const widthBefore = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(widthBefore).toBe(280);

    // Hide sidebar
    await dacmPage.locator("#sidebar-hide-btn").click();
    await expect(sidebar).toHaveClass(/sidebar--collapsed/);

    // Wait for sidebar collapse transition to finish
    await dacmPage.waitForTimeout(300);

    // Main content should expand to fill most of the viewport
    const mainWidth = await dacmPage.locator("#main-content").evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const viewportWidth = dacmPage.viewportSize()!.width;
    expect(mainWidth).toBeGreaterThan(viewportWidth * 0.9);

    // Show sidebar again
    await toggleBtn.click();
    await expect(sidebar).not.toHaveClass(/sidebar--collapsed/);

    // Wait for expand transition
    await dacmPage.waitForTimeout(300);

    // Sidebar width restored
    const widthAfter = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(widthAfter).toBe(280);
  });

  test("task selection -> archive -> returns to start page", async ({ dacmPage }) => {
    // Select a task
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();
    await expect(dacmPage.locator(".task-detail-name")).toHaveText("Fix pagination bug");

    // Archive it
    dacmPage.on("dialog", (dialog) => dialog.accept());
    await dacmPage.locator("#btn-archive").click();

    // Should return to start page
    await expect(dacmPage.locator(".start-page")).toBeVisible({ timeout: 3000 });
    // Task should be gone from sidebar
    await expect(getTaskRowByName(dacmPage, "Fix pagination bug")).toHaveCount(0);
  });

  test("keyboard: Cmd+N deselects task and shows start page", async ({ dacmPage }) => {
    // Select a task
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();
    await expect(dacmPage.locator(".task-detail-name")).toBeVisible();

    // Press Cmd+N
    await dacmPage.keyboard.press("Meta+n");

    // Start page should appear
    await expect(dacmPage.locator(".start-page")).toBeVisible({ timeout: 3000 });
  });

  test("keyboard: Escape deselects task", async ({ dacmPage }) => {
    // Select a task
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();
    await expect(dacmPage.locator(".task-detail-name")).toBeVisible();

    // Press Escape
    await dacmPage.keyboard.press("Escape");

    // Start page should appear
    await expect(dacmPage.locator(".start-page")).toBeVisible({ timeout: 3000 });
  });

  test("gear menu: toggle theme shortcut works", async ({ dacmPage }) => {
    await dacmPage.locator("#sidebar-gear-btn").click();
    await expect(dacmPage.locator(".gear-menu")).toBeVisible();

    // Click theme toggle
    const themeBtn = dacmPage.locator("[data-action='toggle-theme']");
    const label = await themeBtn.textContent();
    await themeBtn.click();

    // Theme should have changed
    const theme = await dacmPage.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    if (label?.includes("Light")) {
      expect(theme).toBe("light");
    } else {
      expect(theme).toBe("dark");
    }
  });
});
