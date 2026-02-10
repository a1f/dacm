use std::io::Read;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::session::SessionManager;

#[tauri::command]
pub fn spawn_session(
    session_mgr: State<'_, SessionManager>,
    task_id: i32,
    project_id: i32,
    working_dir: String,
    initial_prompt: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    session_mgr.spawn(
        task_id,
        project_id,
        working_dir,
        initial_prompt,
        rows.unwrap_or(24),
        cols.unwrap_or(80),
    )
}

#[tauri::command]
pub fn write_to_session(
    session_mgr: State<'_, SessionManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    session_mgr.write(&session_id, &data)
}

#[tauri::command]
pub fn resize_session(
    session_mgr: State<'_, SessionManager>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    session_mgr.resize(&session_id, rows, cols)
}

#[tauri::command]
pub fn kill_session(
    session_mgr: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    session_mgr.kill(&session_id)
}

#[tauri::command]
pub fn list_sessions(
    session_mgr: State<'_, SessionManager>,
) -> Result<Vec<crate::session::SessionInfo>, String> {
    session_mgr.list()
}

#[tauri::command]
pub async fn start_session_stream(
    app_handle: AppHandle,
    session_id: String,
) -> Result<(), String> {
    let session_mgr = app_handle.state::<SessionManager>();
    let reader = session_mgr.take_reader(&session_id)?;

    let id = session_id.clone();
    let handle = app_handle.clone();

    tauri::async_runtime::spawn_blocking(move || {
        stream_pty_output(reader, &id, &handle);
    });

    Ok(())
}

fn stream_pty_output(
    mut reader: Box<dyn Read + Send>,
    session_id: &str,
    app_handle: &AppHandle,
) {
    let mut buf = [0u8; 4096];

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = buf[..n].to_vec();
                let event_name = format!("session-output-{session_id}");
                let _ = app_handle.emit(&event_name, chunk);
            }
            Err(e) => {
                eprintln!("PTY read error for {session_id}: {e}");
                break;
            }
        }
    }

    let session_mgr = app_handle.state::<SessionManager>();
    session_mgr.mark_exited(session_id);

    let exit_event = format!("session-exit-{session_id}");
    let _ = app_handle.emit(&exit_event, ());
}
