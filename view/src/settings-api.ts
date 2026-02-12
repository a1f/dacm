import { invoke } from "@tauri-apps/api/core";
import type { Setting } from "./types.ts";

export async function getSetting(key: string): Promise<string> {
  return invoke<string>("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await invoke("set_setting", { key, value });
}

export async function listSettings(): Promise<Setting[]> {
  return invoke<Setting[]>("list_settings");
}
