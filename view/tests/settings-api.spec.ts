import { test, expect } from "./fixtures.ts";

test.describe("Settings API (mock)", () => {
  test("list_settings returns all default settings", async ({ dacmPage }) => {
    const settings = await dacmPage.evaluate(() => {
      return (window as any).__MOCK_STATE__.settings;
    });

    expect(settings).toHaveLength(8);
    const keys = settings.map((s: any) => s.key);
    expect(keys).toContain("theme");
    expect(keys).toContain("prevent_sleep");
    expect(keys).toContain("code_font_family");
    expect(keys).toContain("code_font_size");
    expect(keys).toContain("terminal_font_family");
    expect(keys).toContain("terminal_font_size");
    expect(keys).toContain("worktree_base_path");
    expect(keys).toContain("worktree_branch_pattern");
  });

  test("get_setting returns correct default for theme", async ({ dacmPage }) => {
    const value = await dacmPage.evaluate(async () => {
      return window.__TAURI_INTERNALS__.invoke("get_setting", { key: "theme" });
    });
    expect(value).toBe("system");
  });

  test("get_setting returns correct default for terminal_font_size", async ({ dacmPage }) => {
    const value = await dacmPage.evaluate(async () => {
      return window.__TAURI_INTERNALS__.invoke("get_setting", { key: "terminal_font_size" });
    });
    expect(value).toBe("13");
  });

  test("set_setting updates an existing setting", async ({ dacmPage }) => {
    await dacmPage.evaluate(async () => {
      await window.__TAURI_INTERNALS__.invoke("set_setting", { key: "theme", value: "dark" });
    });

    const value = await dacmPage.evaluate(async () => {
      return window.__TAURI_INTERNALS__.invoke("get_setting", { key: "theme" });
    });
    expect(value).toBe("dark");
  });

  test("set_setting creates a new setting", async ({ dacmPage }) => {
    await dacmPage.evaluate(async () => {
      await window.__TAURI_INTERNALS__.invoke("set_setting", { key: "custom_key", value: "custom_value" });
    });

    const value = await dacmPage.evaluate(async () => {
      return window.__TAURI_INTERNALS__.invoke("get_setting", { key: "custom_key" });
    });
    expect(value).toBe("custom_value");
  });

  test("get_setting returns empty string for unknown key", async ({ dacmPage }) => {
    const value = await dacmPage.evaluate(async () => {
      return window.__TAURI_INTERNALS__.invoke("get_setting", { key: "nonexistent" });
    });
    expect(value).toBe("");
  });

  test("list_settings reflects updated values", async ({ dacmPage }) => {
    await dacmPage.evaluate(async () => {
      await window.__TAURI_INTERNALS__.invoke("set_setting", { key: "code_font_size", value: "16" });
    });

    const settings = await dacmPage.evaluate(() => {
      return (window as any).__MOCK_STATE__.settings;
    });

    const fontSetting = settings.find((s: any) => s.key === "code_font_size");
    expect(fontSetting.value).toBe("16");
  });
});
