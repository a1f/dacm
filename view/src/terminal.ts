import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalSession {
  terminal: Terminal;
  sessionId: string;
  fit: () => void;
  destroy: () => void;
}

// Sessions whose PTY stream has already been started (reader taken)
const startedStreams = new Set<string>();

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
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', 'Menlo', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    scrollback: 100_000,
    theme: {
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
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);
  fitAddon.fit();

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
    terminal.dispose();
  }

  return { terminal, sessionId, fit: () => fitAddon.fit(), destroy };
}
