#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;

#[tauri::command]
fn log_button_press(app_handle: tauri::AppHandle, button: String) -> Result<(), String> {
    let log_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dacm_events.log");

    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{timestamp}] {button} pressed\n");

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;

    file.write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![log_button_press])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
