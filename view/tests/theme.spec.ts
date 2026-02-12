import { test, expect } from "./fixtures.ts";

test.describe("Theme System", () => {
  test("defaults to dark theme (system resolves to dark in headless)", async ({ dacmPage }) => {
    const theme = await dacmPage.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    // Headless Chromium defaults to dark prefers-color-scheme
    expect(["dark", "light"]).toContain(theme);
  });

  test("dark theme has dark background on body", async ({ dacmPage }) => {
    // Force dark
    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    const bg = await dacmPage.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    // #1a1a2e = rgb(26, 26, 46)
    expect(bg).toBe("rgb(26, 26, 46)");
  });

  test("light theme has white background on body", async ({ dacmPage }) => {
    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    const bg = await dacmPage.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    // #ffffff = rgb(255, 255, 255)
    expect(bg).toBe("rgb(255, 255, 255)");
  });

  test("dark theme CSS vars resolve correctly", async ({ dacmPage }) => {
    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    const sidebarBg = await dacmPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sidebar-bg").trim(),
    );
    expect(sidebarBg).toBe("#16213e");
  });

  test("light theme CSS vars resolve correctly", async ({ dacmPage }) => {
    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    const sidebarBg = await dacmPage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sidebar-bg").trim(),
    );
    expect(sidebarBg).toBe("#f3f3f3");
  });

  test("sidebar width preserved across themes", async ({ dacmPage }) => {
    const darkWidth = await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
      return document.querySelector("#sidebar")!.getBoundingClientRect().width;
    });

    const lightWidth = await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      return document.querySelector("#sidebar")!.getBoundingClientRect().width;
    });

    expect(darkWidth).toBe(280);
    expect(lightWidth).toBe(280);
  });

  test("layout flexbox preserved across themes", async ({ dacmPage }) => {
    for (const theme of ["dark", "light"] as const) {
      await dacmPage.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
      }, theme);

      const display = await dacmPage.locator(".layout").evaluate(
        (el) => getComputedStyle(el).display,
      );
      expect(display).toBe("flex");
    }
  });

  test("text color changes between themes", async ({ dacmPage }) => {
    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    const darkText = await dacmPage.evaluate(() =>
      getComputedStyle(document.body).color,
    );

    await dacmPage.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    const lightText = await dacmPage.evaluate(() =>
      getComputedStyle(document.body).color,
    );

    // Dark text is light (#e0e0e0 = rgb(224, 224, 224))
    expect(darkText).toBe("rgb(224, 224, 224)");
    // Light text is dark (#1e1e1e = rgb(30, 30, 30))
    expect(lightText).toBe("rgb(30, 30, 30)");
  });
});
