import { getSetting, setSetting } from "./settings-api.ts";
import { setTheme, getEffectiveTheme } from "./theme.ts";
import type { ThemeMode } from "./types.ts";

export interface GeneralSettingsCallbacks {
  onPreventSleepChange: (prevent: boolean) => void;
}

async function loadSetting(key: string, fallback: string): Promise<string> {
  try {
    return await getSetting(key);
  } catch {
    return fallback;
  }
}

export async function renderGeneralSettings(
  container: HTMLElement,
  callbacks: GeneralSettingsCallbacks,
): Promise<void> {
  const [
    preventSleep,
    codeFontFamily,
    codeFontSize,
    termFontFamily,
    termFontSize,
  ] = await Promise.all([
    loadSetting("prevent_sleep", "false"),
    loadSetting("code_font_family", '"SF Mono", "Fira Code", monospace'),
    loadSetting("code_font_size", "13"),
    loadSetting("terminal_font_family", '"SF Mono", "Fira Code", "Menlo", monospace'),
    loadSetting("terminal_font_size", "13"),
  ]);

  const currentTheme = getEffectiveTheme();
  let currentMode: ThemeMode = "system";
  try {
    const val = await getSetting("theme");
    if (val === "light" || val === "dark" || val === "system") {
      currentMode = val;
    }
  } catch {
    // default
  }

  function activeClass(mode: ThemeMode): string {
    return mode === currentMode ? "segmented-btn--active" : "";
  }

  container.innerHTML = `
    <div class="settings-page">
      <h2 class="settings-page-title">General</h2>

      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Theme</div>
            <div class="settings-row-sublabel">Currently: ${currentTheme}</div>
          </div>
          <div class="segmented-control">
            <button class="segmented-btn ${activeClass("light")}" data-theme="light">Light</button>
            <button class="segmented-btn ${activeClass("dark")}" data-theme="dark">Dark</button>
            <button class="segmented-btn ${activeClass("system")}" data-theme="system">System</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">System</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Prevent sleep</div>
            <div class="settings-row-sublabel">Keep Mac awake while tasks are running</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="prevent-sleep-toggle" ${preventSleep === "true" ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Code Font</div>
        <div class="settings-row">
          <div class="settings-row-label">Family</div>
          <input type="text" class="settings-input" id="code-font-family" value="${escapeAttr(codeFontFamily)}" />
        </div>
        <div class="settings-row">
          <div class="settings-row-label">Size</div>
          <input type="number" class="settings-input settings-input--narrow" id="code-font-size" value="${codeFontSize}" min="8" max="24" />
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Terminal Font</div>
        <div class="settings-row">
          <div class="settings-row-label">Family</div>
          <input type="text" class="settings-input" id="term-font-family" value="${escapeAttr(termFontFamily)}" />
        </div>
        <div class="settings-row">
          <div class="settings-row-label">Size</div>
          <input type="number" class="settings-input settings-input--narrow" id="term-font-size" value="${termFontSize}" min="8" max="24" />
        </div>
      </div>
    </div>`;

  // Theme buttons
  container.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = (btn as HTMLElement).dataset.theme as ThemeMode;
      setTheme(mode);
      // Re-render to update active state
      renderGeneralSettings(container, callbacks);
    });
  });

  // Prevent sleep toggle
  container.querySelector("#prevent-sleep-toggle")?.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    setSetting("prevent_sleep", String(checked));
    callbacks.onPreventSleepChange(checked);
  });

  // Code font family
  container.querySelector("#code-font-family")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    setSetting("code_font_family", val);
    document.documentElement.style.setProperty("--code-font-family", val);
  });

  // Code font size
  container.querySelector("#code-font-size")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    setSetting("code_font_size", val);
    document.documentElement.style.setProperty("--code-font-size", val + "px");
  });

  // Terminal font family
  container.querySelector("#term-font-family")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    setSetting("terminal_font_family", val);
  });

  // Terminal font size
  container.querySelector("#term-font-size")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    setSetting("terminal_font_size", val);
  });
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
