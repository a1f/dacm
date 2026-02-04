#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod models;
mod schema;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");

            let db_state =
                db::init_db(&app_data_dir).expect("failed to initialize database");

            app.manage(db_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_project,
            commands::remove_project,
            commands::list_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
