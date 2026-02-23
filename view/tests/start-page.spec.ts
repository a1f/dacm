import { test, expect } from "./fixtures.ts";
import { getMainContent } from "./helpers.ts";

test.describe("Start Page", () => {
  test("shows 'What do you want to build?' title", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);
    await expect(main.locator(".start-page-title")).toContainText("What do you want to build?");
  });

  test("shows workspace picker with first workspace selected", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#workspace-picker-btn")).toBeVisible();
    await expect(dacmPage.locator(".workspace-picker-label")).toContainText("web-app");
  });

  test("workspace picker dropdown opens on click", async ({ dacmPage }) => {
    await dacmPage.locator("#workspace-picker-btn").click();
    await expect(dacmPage.locator(".workspace-picker-dropdown")).toBeVisible();
    // Should show all 3 workspaces + add workspace
    const items = dacmPage.locator(".workspace-picker-item");
    await expect(items).toHaveCount(4); // 3 workspaces + "Add workspace"
  });

  test("selecting a workspace in dropdown updates the label", async ({ dacmPage }) => {
    await dacmPage.locator("#workspace-picker-btn").click();
    await dacmPage.locator(".workspace-picker-item", { hasText: "api-server" }).click();
    await expect(dacmPage.locator(".workspace-picker-label")).toContainText("api-server");
  });

  test("prompt input is visible and focusable", async ({ dacmPage }) => {
    const input = dacmPage.locator("#start-page-input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("send button is visible", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#start-page-send")).toBeVisible();
  });

  test("Enter in prompt triggers project creation", async ({ dacmPage }) => {
    const input = dacmPage.locator("#start-page-input");
    await input.fill("Build a login page");
    await input.press("Enter");

    // After project creation, the start page should disappear
    // and project detail or terminal should appear
    await expect(dacmPage.locator(".start-page")).not.toBeVisible({ timeout: 3000 });
  });

  test("Shift+Enter inserts newline instead of submitting", async ({ dacmPage }) => {
    const input = dacmPage.locator("#start-page-input");
    await input.fill("Line one");
    await input.press("Shift+Enter");
    await input.type("Line two");

    const value = await input.inputValue();
    expect(value).toContain("Line one");
    expect(value).toContain("Line two");
    // Start page should still be visible (not submitted)
    await expect(dacmPage.locator(".start-page")).toBeVisible();
  });
});
