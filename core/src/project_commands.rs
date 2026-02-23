use diesel::prelude::*;
use rand::Rng;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::DbState;
use crate::schema::projects;
use crate::project_models::{NewProject, Project, ProjectStatusChanged};

const VALID_STATUSES: &[&str] = &["running", "waiting", "completed", "failed", "archived"];

#[tauri::command]
pub fn create_project(
    state: State<'_, DbState>,
    workspace_id: i32,
    name: String,
    description: Option<String>,
) -> Result<Project, String> {
    let desc = description.unwrap_or_default();
    let new_project = NewProject {
        name: &name,
        workspace_id,
        description: &desc,
    };

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::insert_into(projects::table)
        .values(&new_project)
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to create project: {e}"))?;

    projects::table
        .order(projects::id.desc())
        .select(Project::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch project: {e}"))
}

#[tauri::command]
pub fn update_project_status(
    state: State<'_, DbState>,
    project_id: i32,
    status: String,
) -> Result<Project, String> {
    if !VALID_STATUSES.contains(&status.as_str()) {
        return Err(format!("Invalid status: {status}. Must be one of: {VALID_STATUSES:?}"));
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::update(projects::table.filter(projects::id.eq(project_id)))
        .set(projects::status.eq(&status))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to update project status: {e}"))?;

    projects::table
        .filter(projects::id.eq(project_id))
        .select(Project::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch project: {e}"))
}

#[tauri::command]
pub fn rename_project(
    state: State<'_, DbState>,
    project_id: i32,
    name: String,
) -> Result<Project, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::update(projects::table.filter(projects::id.eq(project_id)))
        .set(projects::name.eq(&name))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to rename project: {e}"))?;

    projects::table
        .filter(projects::id.eq(project_id))
        .select(Project::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch project: {e}"))
}

#[tauri::command]
pub fn archive_project(state: State<'_, DbState>, project_id: i32) -> Result<Project, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::update(projects::table.filter(projects::id.eq(project_id)))
        .set(projects::status.eq("archived"))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to archive project: {e}"))?;

    projects::table
        .filter(projects::id.eq(project_id))
        .select(Project::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch project: {e}"))
}

#[tauri::command]
pub fn list_projects_by_workspace(
    state: State<'_, DbState>,
    workspace_id: i32,
) -> Result<Vec<Project>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    projects::table
        .filter(projects::workspace_id.eq(workspace_id))
        .filter(projects::status.ne("archived"))
        .select(Project::as_select())
        .order(projects::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list projects: {e}"))
}

#[tauri::command]
pub fn list_archived_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    projects::table
        .filter(projects::status.eq("archived"))
        .select(Project::as_select())
        .order(projects::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list archived projects: {e}"))
}

#[tauri::command]
pub fn delete_project(state: State<'_, DbState>, project_id: i32) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::delete(projects::table.filter(projects::id.eq(project_id)))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to delete project: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn list_all_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    projects::table
        .filter(projects::status.ne("archived"))
        .select(Project::as_select())
        .order(projects::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list projects: {e}"))
}

#[tauri::command]
pub async fn simulate_project(app_handle: AppHandle, project_id: i32) -> Result<(), String> {
    {
        let db = app_handle.state::<DbState>();
        let mut conn = db.conn.lock().map_err(|e| e.to_string())?;

        diesel::update(projects::table.filter(projects::id.eq(project_id)))
            .set(projects::status.eq("running"))
            .execute(&mut *conn)
            .map_err(|e| format!("Failed to set running: {e}"))?;
    }

    app_handle
        .emit(
            "project-status-changed",
            ProjectStatusChanged {
                project_id,
                status: "running".to_string(),
            },
        )
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    let handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_secs(10));
        })
        .await
        .ok();

        let new_status = if rand::thread_rng().gen_bool(0.5) {
            "completed"
        } else {
            "waiting"
        };

        {
            let db = handle.state::<DbState>();
            let mut conn = match db.conn.lock() {
                Ok(c) => c,
                Err(_) => return,
            };
            let _ = diesel::update(projects::table.filter(projects::id.eq(project_id)))
                .set(projects::status.eq(new_status))
                .execute(&mut *conn);
        }

        let _ = handle.emit(
            "project-status-changed",
            ProjectStatusChanged {
                project_id,
                status: new_status.to_string(),
            },
        );
    });

    Ok(())
}
