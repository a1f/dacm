import { test, expect } from "./fixtures.ts";
import { getTaskRowByName, getMainContent } from "./helpers.ts";

test.describe("Task Detail", () => {
  test("shows new task form when no task is selected", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);
    await expect(main.locator(".new-task-panel-title")).toHaveText("New Task");
    await expect(main.locator("#ntp-name")).toBeVisible();
    await expect(main.locator("#ntp-project")).toBeVisible();
    await expect(main.locator("#ntp-description")).toBeVisible();
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
});
