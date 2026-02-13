import { test, expect } from "./fixtures.ts";

test.describe("Worktree Settings", () => {
  async function openWorktreeSettings(page: any) {
    await page.locator("#sidebar-gear-btn").click();
    await page.locator("[data-action='settings']").click();
    await page.waitForSelector(".settings-page-title", { timeout: 3000 });
    await page.locator(".settings-nav-item", { hasText: "Worktrees" }).click();
    await page.waitForSelector(".settings-page-title", { timeout: 3000 });
  }

  test("renders worktree settings page", async ({ dacmPage }) => {
    await openWorktreeSettings(dacmPage);
    await expect(dacmPage.locator(".settings-page-title")).toHaveText("Worktrees");
  });

  test("base path input renders with empty default", async ({ dacmPage }) => {
    await openWorktreeSettings(dacmPage);
    const val = await dacmPage.locator("#worktree-base-path").inputValue();
    expect(val).toBe("");
  });

  test("branch pattern input has default value", async ({ dacmPage }) => {
    await openWorktreeSettings(dacmPage);
    const val = await dacmPage.locator("#worktree-branch-pattern").inputValue();
    expect(val).toBe("feature/{task_name}");
  });

  test("base path input persists value via mock", async ({ dacmPage }) => {
    await openWorktreeSettings(dacmPage);

    await dacmPage.locator("#worktree-base-path").fill("/tmp/worktrees");
    await dacmPage.locator("#worktree-base-path").dispatchEvent("change");

    // Verify mock state was updated
    const val = await dacmPage.evaluate(() =>
      (window as any).__MOCK_STATE__.settings.find((s: any) => s.key === "worktree_base_path")?.value,
    );
    expect(val).toBe("/tmp/worktrees");
  });

  test("branch pattern input persists value via mock", async ({ dacmPage }) => {
    await openWorktreeSettings(dacmPage);

    await dacmPage.locator("#worktree-branch-pattern").fill("task/{task_name}");
    await dacmPage.locator("#worktree-branch-pattern").dispatchEvent("change");

    const val = await dacmPage.evaluate(() =>
      (window as any).__MOCK_STATE__.settings.find((s: any) => s.key === "worktree_branch_pattern")?.value,
    );
    expect(val).toBe("task/{task_name}");
  });
});
