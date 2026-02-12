import { test, expect } from "./fixtures.ts";
import { getSidebar, getMainContent } from "./helpers.ts";

test.describe("Layout", () => {
  test("sidebar has correct width (280px)", async ({ dacmPage }) => {
    const sidebar = getSidebar(dacmPage);
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(280);
  });

  test("main content fills remaining space", async ({ dacmPage }) => {
    const main = getMainContent(dacmPage);
    const sidebar = getSidebar(dacmPage);

    const mainBox = await main.boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    const viewport = dacmPage.viewportSize()!;

    expect(mainBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    // Main content width should be viewport width minus sidebar width (approx)
    expect(mainBox!.width).toBeGreaterThan(viewport.width - sidebarBox!.width - 10);
  });

  test("layout uses flexbox", async ({ dacmPage }) => {
    const display = await dacmPage.locator(".layout").evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("flex");
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Need to inject mocks before navigating
    const { injectTauriMock } = await import("./mocks/tauri-mock.ts");
    const { mockProjects, mockTasks } = await import("../mocks/mock-data.ts");
    await injectTauriMock(page, { projects: mockProjects, tasks: mockTasks, sessions: [] });
    await page.goto("/");
    await page.waitForSelector(".project-group", { timeout: 5000 });

    expect(errors).toEqual([]);
  });
});
