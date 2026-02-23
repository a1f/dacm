#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace_commands;
mod constants;
mod db;
mod models;
mod schema;
mod session;
mod session_commands;
mod settings_commands;
mod system_commands;
mod settings_models;
mod sleep_commands;
mod project_commands;
mod project_models;

use tauri::{Manager, RunEvent};

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");

            let db_state =
                db::init_db(&app_data_dir).expect("failed to initialize database");

            app.manage(db_state);
            app.manage(session::SessionManager::new());
            app.manage(sleep_commands::SleepState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_commands::add_workspace,
            workspace_commands::remove_workspace,
            workspace_commands::list_workspaces,
            project_commands::create_project,
            project_commands::update_project_status,
            project_commands::rename_project,
            project_commands::archive_project,
            project_commands::list_projects_by_workspace,
            project_commands::list_all_projects,
            project_commands::simulate_project,
            session_commands::spawn_session,
            session_commands::write_to_session,
            session_commands::resize_session,
            session_commands::kill_session,
            session_commands::list_sessions,
            session_commands::start_session_stream,
            settings_commands::get_setting,
            settings_commands::set_setting,
            settings_commands::list_settings,
            sleep_commands::set_prevent_sleep,
            project_commands::list_archived_projects,
            project_commands::delete_project,
            system_commands::get_system_stats,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            let session_mgr = app_handle.state::<session::SessionManager>();
            session_mgr.kill_all();
            let sleep_state = app_handle.state::<sleep_commands::SleepState>();
            sleep_state.kill();
        }
    });
}
