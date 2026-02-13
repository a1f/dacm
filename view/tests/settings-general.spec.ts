import { test, expect } from "./fixtures.ts";

test.describe("General Settings", () => {
  async function openGeneralSettings(page: any) {
    await page.locator("#sidebar-gear-btn").click();
    await page.locator("[data-action='settings']").click();
    await page.waitForSelector(".settings-page-title", { timeout: 3000 });
  }

  test("renders theme segmented control", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    const buttons = dacmPage.locator(".segmented-btn");
    await expect(buttons).toHaveCount(3);
    await expect(buttons.nth(0)).toHaveText("Light");
    await expect(buttons.nth(1)).toHaveText("Dark");
    await expect(buttons.nth(2)).toHaveText("System");
  });

  test("system theme button is active by default", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    await expect(dacmPage.locator(".segmented-btn--active")).toHaveText("System");
  });

  test("clicking theme button changes active state", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    await dacmPage.locator(".segmented-btn", { hasText: "Dark" }).click();
    // After re-render, Dark should be active
    await expect(dacmPage.locator(".segmented-btn--active")).toHaveText("Dark");
  });

  test("clicking light theme changes data-theme attribute", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    await dacmPage.locator(".segmented-btn", { hasText: "Light" }).click();

    const theme = await dacmPage.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");
  });

  test("prevent sleep toggle renders", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    await expect(dacmPage.locator(".toggle-switch")).toBeVisible();
    await expect(dacmPage.locator("#prevent-sleep-toggle")).toBeAttached();
  });

  test("prevent sleep toggle is unchecked by default", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    const checked = await dacmPage.locator("#prevent-sleep-toggle").isChecked();
    expect(checked).toBe(false);
  });

  test("code font family input renders with default value", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    const val = await dacmPage.locator("#code-font-family").inputValue();
    expect(val).toContain("SF Mono");
  });

  test("code font size input renders with default value", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    const val = await dacmPage.locator("#code-font-size").inputValue();
    expect(val).toBe("13");
  });

  test("terminal font family input renders", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    await expect(dacmPage.locator("#term-font-family")).toBeVisible();
  });

  test("terminal font size input renders with default value", async ({ dacmPage }) => {
    await openGeneralSettings(dacmPage);
    const val = await dacmPage.locator("#term-font-size").inputValue();
    expect(val).toBe("13");
  });
});
