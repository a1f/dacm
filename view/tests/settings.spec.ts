import { test, expect } from "./fixtures.ts";

test.describe("Settings Navigation", () => {
  async function openSettings(page: any) {
    await page.locator("#sidebar-gear-btn").click();
    await page.locator("[data-action='settings']").click();
    await page.waitForSelector(".settings-nav-back", { timeout: 3000 });
  }

  test("gear menu opens settings view", async ({ dacmPage }) => {
    await openSettings(dacmPage);
    await expect(dacmPage.locator(".settings-nav-back")).toBeVisible();
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("General");
  });

  test("settings nav shows all 3 pages", async ({ dacmPage }) => {
    await openSettings(dacmPage);
    const items = dacmPage.locator(".settings-nav-item");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText("General");
    await expect(items.nth(1)).toHaveText("Worktrees");
    await expect(items.nth(2)).toHaveText("Archived");
  });

  test("clicking nav items switches pages", async ({ dacmPage }) => {
    await openSettings(dacmPage);

    await dacmPage.locator(".settings-nav-item", { hasText: "Worktrees" }).click();
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("Worktrees");

    await dacmPage.locator(".settings-nav-item", { hasText: "Archived" }).click();
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("Archived");

    await dacmPage.locator(".settings-nav-item", { hasText: "General" }).click();
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("General");
  });

  test("back button returns to tasks view", async ({ dacmPage }) => {
    await openSettings(dacmPage);
    await dacmPage.locator(".settings-nav-back").click();
    // Should show start page (no task selected)
    await expect(dacmPage.locator(".start-page-title")).toBeVisible();
  });

  test("active nav item is highlighted", async ({ dacmPage }) => {
    await openSettings(dacmPage);
    await expect(dacmPage.locator(".settings-nav-item--active")).toHaveText("General");

    await dacmPage.locator(".settings-nav-item", { hasText: "Worktrees" }).click();
    await expect(dacmPage.locator(".settings-nav-item--active")).toHaveText("Worktrees");
  });
});
