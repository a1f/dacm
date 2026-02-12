import type { ThemeMode } from "./types.ts";
import type { ITheme } from "@xterm/xterm";
import { getSetting, setSetting } from "./settings-api.ts";

let currentMode: ThemeMode = "system";
let mediaQuery: MediaQueryList | null = null;

function applyTheme(effective: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", effective);
  window.dispatchEvent(new CustomEvent("dacm-theme-changed", { detail: { theme: effective } }));
}

function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function onSystemChange(): void {
  if (currentMode === "system") {
    applyTheme(resolveSystemTheme());
  }
}

export function getEffectiveTheme(): "light" | "dark" {
  if (currentMode === "system") return resolveSystemTheme();
  return currentMode;
}

export function getTerminalTheme(): ITheme {
  const isDark = getEffectiveTheme() === "dark";
  return isDark
    ? {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#24c8db",
        selectionBackground: "rgba(36, 200, 219, 0.3)",
        black: "#1a1a2e",
        red: "#e53e3e",
        green: "#48bb78",
        yellow: "#ed8936",
        blue: "#24c8db",
        magenta: "#b794f6",
        cyan: "#76e4f7",
        white: "#e0e0e0",
        brightBlack: "#555",
        brightRed: "#fc8181",
        brightGreen: "#68d391",
        brightYellow: "#fbd38d",
        brightBlue: "#63b3ed",
        brightMagenta: "#d6bcfa",
        brightCyan: "#9decf9",
        brightWhite: "#ffffff",
      }
    : {
        background: "#ffffff",
        foreground: "#1e1e1e",
        cursor: "#1ba8b8",
        selectionBackground: "rgba(36, 200, 219, 0.2)",
        black: "#1e1e1e",
        red: "#c53030",
        green: "#2f855a",
        yellow: "#c05621",
        blue: "#1ba8b8",
        magenta: "#805ad5",
        cyan: "#0987a0",
        white: "#e2e8f0",
        brightBlack: "#718096",
        brightRed: "#e53e3e",
        brightGreen: "#48bb78",
        brightYellow: "#ed8936",
        brightBlue: "#24c8db",
        brightMagenta: "#b794f6",
        brightCyan: "#76e4f7",
        brightWhite: "#1a202c",
      };
}

export async function setTheme(mode: ThemeMode): Promise<void> {
  currentMode = mode;

  if (mediaQuery) {
    mediaQuery.removeEventListener("change", onSystemChange);
    mediaQuery = null;
  }

  if (mode === "system") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", onSystemChange);
    applyTheme(resolveSystemTheme());
  } else {
    applyTheme(mode);
  }

  await setSetting("theme", mode);
}

export async function initTheme(): Promise<void> {
  let stored: ThemeMode = "system";
  try {
    const val = await getSetting("theme");
    if (val === "light" || val === "dark" || val === "system") {
      stored = val;
    }
  } catch {
    // Use default
  }
  currentMode = stored;

  if (stored === "system") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", onSystemChange);
    applyTheme(resolveSystemTheme());
  } else {
    applyTheme(stored);
  }
}
