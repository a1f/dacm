import { test, expect } from "./fixtures.ts";

test.describe("Archived Settings", () => {
  async function openArchivedSettings(page: any) {
    await page.locator("#sidebar-gear-btn").click();
    await page.locator("[data-action='settings']").click();
    await page.waitForSelector(".settings-page-title", { timeout: 3000 });
    await page.locator(".settings-nav-item", { hasText: "Archived" }).click();
    await page.waitForSelector(".settings-page-title", { timeout: 3000 });
  }

  test("renders archived settings page", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("Archived");
  });

  test("shows archived task from mock data", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await expect(dacmPage.locator(".archived-task-name")).toContainText("Refactor legacy auth module");
  });

  test("archived task shows project name and date", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await expect(dacmPage.locator(".archived-task-meta")).toContainText("web-app");
  });

  test("restore button is visible on archived task", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await expect(dacmPage.locator("[data-action='restore']")).toBeVisible();
  });

  test("delete button is visible on archived task", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await expect(dacmPage.locator("[data-action='delete']")).toBeVisible();
  });

  test("restore invokes update_task_status mock", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);
    await dacmPage.locator("[data-action='restore']").click();

    // After restore, the task should no longer be archived in mock state
    const task = await dacmPage.evaluate(() =>
      (window as any).__MOCK_STATE__.tasks.find((t: any) => t.id === 6),
    );
    expect(task.status).toBe("waiting");
  });

  test("delete invokes delete_task mock after confirm", async ({ dacmPage }) => {
    await openArchivedSettings(dacmPage);

    dacmPage.on("dialog", (dialog) => dialog.accept());
    await dacmPage.locator("[data-action='delete']").click();

    // After delete, task should be gone from mock state
    const task = await dacmPage.evaluate(() =>
      (window as any).__MOCK_STATE__.tasks.find((t: any) => t.id === 6),
    );
    expect(task).toBeUndefined();
  });
});
