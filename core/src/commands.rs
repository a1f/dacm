use diesel::prelude::*;
use tauri::State;

use crate::db::DbState;
use crate::models::{NewProject, Project};
use crate::schema::projects;

#[tauri::command]
pub fn add_project(state: State<'_, DbState>, path: String) -> Result<Project, String> {
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed")
        .to_string();

    let new_project = NewProject {
        name: &name,
        path: &path,
    };

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::insert_into(projects::table)
        .values(&new_project)
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to add project: {e}"))?;

    projects::table
        .filter(projects::path.eq(&path))
        .select(Project::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch project: {e}"))
}

#[tauri::command]
pub fn remove_project(state: State<'_, DbState>, id: i32) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let deleted = diesel::delete(projects::table.filter(projects::id.eq(id)))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to remove project: {e}"))?;

    if deleted == 0 {
        return Err(format!("Project with id {id} not found"));
    }

    Ok(())
}

#[tauri::command]
pub fn list_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    projects::table
        .select(Project::as_select())
        .order(projects::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list projects: {e}"))
}
