use diesel::prelude::*;
use tauri::State;

use crate::db::DbState;
use crate::models::{NewWorkspace, Workspace};
use crate::schema::workspaces;

#[tauri::command]
pub fn add_workspace(state: State<'_, DbState>, path: String) -> Result<Workspace, String> {
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed")
        .to_string();

    let new_workspace = NewWorkspace {
        name: &name,
        path: &path,
    };

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::insert_into(workspaces::table)
        .values(&new_workspace)
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to add workspace: {e}"))?;

    workspaces::table
        .filter(workspaces::path.eq(&path))
        .select(Workspace::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch workspace: {e}"))
}

#[tauri::command]
pub fn remove_workspace(state: State<'_, DbState>, id: i32) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let deleted = diesel::delete(workspaces::table.filter(workspaces::id.eq(id)))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to remove workspace: {e}"))?;

    if deleted == 0 {
        return Err(format!("Workspace with id {id} not found"));
    }

    Ok(())
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, DbState>) -> Result<Vec<Workspace>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    workspaces::table
        .select(Workspace::as_select())
        .order(workspaces::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list workspaces: {e}"))
}
