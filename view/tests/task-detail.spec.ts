import { test, expect } from "./fixtures.ts";
import { getTaskRowByName, getMainContent } from "./helpers.ts";

test.describe("Task Detail", () => {
  test("shows start page when no task is selected", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);
    await expect(main.locator(".start-page-title")).toContainText("What do you want to build?");
    await expect(main.locator("#start-page-input")).toBeVisible();
  });

  test("shows static detail when task is selected", async ({ dacmPage }) => {
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();

    const main = getMainContent(dacmPage);
    await expect(main.locator(".task-detail-name")).toHaveText("Fix pagination bug");
    await expect(main.locator(".status-badge--waiting")).toBeVisible();
  });

  test("shows status buttons on static detail", async ({ dacmPage }) => {
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();

    const main = getMainContent(dacmPage);
    await expect(main.locator('.btn-status[data-status="running"]')).toBeVisible();
    await expect(main.locator('.btn-status[data-status="waiting"]')).toBeDisabled();
    await expect(main.locator('.btn-status[data-status="completed"]')).toBeVisible();
    await expect(main.locator("#btn-archive")).toBeVisible();
  });

  test("shows description when present", async ({ dacmPage }) => {
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();

    const main = getMainContent(dacmPage);
    await expect(main.locator(".task-detail-section", { hasText: "Description" })).toContainText("Users report page 2");
  });

  test("shows iteration count", async ({ dacmPage }) => {
    await getTaskRowByName(dacmPage, "Add authentication flow").click();

    const main = getMainContent(dacmPage);
    await expect(main.locator(".task-detail-section", { hasText: "Iterations" })).toContainText("3");
  });

  test("archive button removes task from sidebar", async ({ dacmPage }) => {
    await getTaskRowByName(dacmPage, "Fix pagination bug").click();

    // Mock the confirm dialog
    dacmPage.on("dialog", (dialog) => dialog.accept());

    await dacmPage.locator("#btn-archive").click();

    // Task should no longer be in sidebar
    await expect(getTaskRowByName(dacmPage, "Fix pagination bug")).toHaveCount(0);
  });
});
