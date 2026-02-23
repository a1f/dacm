import { test as base } from "@playwright/test";
import { injectTauriMock, type MockData } from "./mocks/tauri-mock.ts";
import { mockWorkspaces, mockProjects, mockSettings } from "../mocks/mock-data.ts";

const defaultMockData: MockData = {
  workspaces: mockWorkspaces,
  projects: mockProjects,
  sessions: [],
  settings: mockSettings,
};

/**
 * Extended test fixture that injects Tauri mocks and navigates to the app.
 * Use `dacmPage` instead of `page` in tests.
 */
export const test = base.extend<{ dacmPage: base["page"] extends (...args: infer A) => infer R ? R : never; mockData: MockData }>({
  mockData: [defaultMockData, { option: true }],

  dacmPage: async ({ page, mockData }, use) => {
    await injectTauriMock(page, mockData);
    await page.goto("/");
    // Wait for the app to render (sidebar should have workspace groups)
    await page.waitForSelector(".workspace-group", { timeout: 5000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
