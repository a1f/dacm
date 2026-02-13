import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getTerminalTheme } from "./theme.ts";
import { getSetting } from "./settings-api.ts";
import "@xterm/xterm/css/xterm.css";

export interface TerminalSession {
  terminal: Terminal;
  sessionId: string;
  fit: () => void;
  destroy: () => void;
}

// Sessions whose PTY stream has already been started (reader taken)
const startedStreams = new Set<string>();

// Track live terminals for theme updates
const activeTerminals = new Set<Terminal>();

window.addEventListener("dacm-theme-changed", () => {
  const theme = getTerminalTheme();
  for (const t of activeTerminals) {
    t.options.theme = theme;
  }
});

export function markStreamStarted(sessionId: string): void {
  startedStreams.add(sessionId);
}

export function clearStream(sessionId: string): void {
  startedStreams.delete(sessionId);
}

export async function createTerminalSession(
  container: HTMLElement,
  sessionId: string,
  onExit: () => void,
): Promise<TerminalSession> {
  let fontFamily = "'SF Mono', 'Fira Code', 'Fira Mono', 'Menlo', monospace";
  let fontSize = 13;
  try {
    fontFamily = await getSetting("terminal_font_family");
  } catch { /* use default */ }
  try {
    const size = parseInt(await getSetting("terminal_font_size"), 10);
    if (size >= 8 && size <= 24) fontSize = size;
  } catch { /* use default */ }

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily,
    fontSize,
    lineHeight: 1.2,
    scrollback: 100_000,
    theme: getTerminalTheme(),
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);
  fitAddon.fit();
  activeTerminals.add(terminal);

  const decoder = new TextDecoder("utf-8", { fatal: false });

  const unlistenOutput = await listen<number[]>(
    `session-output-${sessionId}`,
    (event) => {
      const bytes = new Uint8Array(event.payload);
      const text = decoder.decode(bytes, { stream: true });
      terminal.write(text);
    },
  );

  const unlistenExit = await listen<void>(
    `session-exit-${sessionId}`,
    () => {
      terminal.write("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
      onExit();
    },
  );

  // Shift+Enter: wrap a newline in bracketed paste so Claude Code treats it as literal newline
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey) {
      if (e.type === "keydown") {
        const seq = "\x1b[200~\n\x1b[201~";
        const bytes = Array.from(new TextEncoder().encode(seq));
        invoke("write_to_session", { sessionId, data: bytes }).catch(() => {});
      }
      return false;
    }
    return true;
  });

  const onDataDisposable = terminal.onData((data) => {
    const bytes = Array.from(new TextEncoder().encode(data));
    invoke("write_to_session", { sessionId, data: bytes }).catch((e) => {
      console.error("Failed to write to session:", e);
    });
  });

  const onResizeDisposable = terminal.onResize(({ rows, cols }) => {
    invoke("resize_session", { sessionId, rows, cols }).catch((e) => {
      console.error("Failed to resize session:", e);
    });
  });

  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(container);

  if (!startedStreams.has(sessionId)) {
    startedStreams.add(sessionId);
    await invoke("start_session_stream", { sessionId });
  }

  await invoke("resize_session", {
    sessionId,
    rows: terminal.rows,
    cols: terminal.cols,
  });

  function destroy() {
    unlistenOutput();
    unlistenExit();
    onDataDisposable.dispose();
    onResizeDisposable.dispose();
    resizeObserver.disconnect();
    activeTerminals.delete(terminal);
    terminal.dispose();
  }

  return { terminal, sessionId, fit: () => fitAddon.fit(), destroy };
}
