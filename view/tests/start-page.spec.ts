import { test, expect } from "./fixtures.ts";
import { getMainContent } from "./helpers.ts";

test.describe("Start Page", () => {
  test("shows 'What do you want to build?' title", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);
    await expect(main.locator(".start-page-title")).toContainText("What do you want to build?");
  });

  test("shows project picker with first project selected", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#project-picker-btn")).toBeVisible();
    await expect(dacmPage.locator(".project-picker-label")).toContainText("web-app");
  });

  test("project picker dropdown opens on click", async ({ dacmPage }) => {
    await dacmPage.locator("#project-picker-btn").click();
    await expect(dacmPage.locator(".project-picker-dropdown")).toBeVisible();
    // Should show all 3 projects + add project
    const items = dacmPage.locator(".project-picker-item");
    await expect(items).toHaveCount(4); // 3 projects + "Add project"
  });

  test("selecting a project in dropdown updates the label", async ({ dacmPage }) => {
    await dacmPage.locator("#project-picker-btn").click();
    await dacmPage.locator(".project-picker-item", { hasText: "api-server" }).click();
    await expect(dacmPage.locator(".project-picker-label")).toContainText("api-server");
  });

  test("prompt input is visible and focusable", async ({ dacmPage }) => {
    const input = dacmPage.locator("#start-page-input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("send button is visible", async ({ dacmPage }) => {
    await expect(dacmPage.locator("#start-page-send")).toBeVisible();
  });

  test("Enter in prompt triggers task creation", async ({ dacmPage }) => {
    const input = dacmPage.locator("#start-page-input");
    await input.fill("Build a login page");
    await input.press("Enter");

    // After task creation, the start page should disappear
    // and task detail or terminal should appear
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
