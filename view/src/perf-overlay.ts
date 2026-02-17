import { invoke } from "@tauri-apps/api/core";
import type { SystemStats } from "./types.ts";

let overlayEl: HTMLElement | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let visible = false;

function createOverlay(): HTMLElement {
  const el = document.createElement("div");
  el.id = "perf-overlay";
  el.innerHTML = `<span class="perf-line">---</span>`;
  document.body.appendChild(el);
  return el;
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}G`;
  return `${mb}M`;
}

function getColor(percent: number): string {
  if (percent > 80) return "#e53e3e";
  if (percent > 60) return "#ecc94b";
  return "#68d391";
}

async function update(): Promise<void> {
  if (!overlayEl) return;
  try {
    const stats = await invoke<SystemStats>("get_system_stats");
    const memColor = getColor(stats.memory_percent);
    overlayEl.innerHTML = `
      <span class="perf-line">CPU ${stats.cpu_usage.toFixed(1)}</span>
      <span class="perf-line" style="color:${memColor}">MEM ${formatMb(stats.memory_used_mb)}/${formatMb(stats.memory_total_mb)} (${stats.memory_percent.toFixed(0)}%)</span>
      <span class="perf-line">PTY ${stats.child_count} &middot; ${formatMb(stats.child_memory_mb)}</span>`;
  } catch {
    overlayEl.innerHTML = `<span class="perf-line" style="color:#e53e3e">stats err</span>`;
  }
}

export function togglePerfOverlay(): void {
  visible = !visible;
  if (visible) {
    if (!overlayEl) overlayEl = createOverlay();
    overlayEl.style.display = "flex";
    update();
    intervalId = setInterval(update, 2000);
  } else {
    if (overlayEl) overlayEl.style.display = "none";
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }
}

export function isPerfOverlayVisible(): boolean {
  return visible;
}
