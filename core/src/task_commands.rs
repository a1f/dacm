use diesel::prelude::*;
use rand::Rng;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::DbState;
use crate::schema::tasks;
use crate::task_models::{NewTask, Task, TaskStatusChanged};

const VALID_STATUSES: &[&str] = &["running", "waiting", "completed", "archived"];

#[tauri::command]
pub fn create_task(
    state: State<'_, DbState>,
    project_id: i32,
    name: String,
    description: Option<String>,
) -> Result<Task, String> {
    let desc = description.unwrap_or_default();
    let new_task = NewTask {
        name: &name,
        project_id,
        description: &desc,
    };

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::insert_into(tasks::table)
        .values(&new_task)
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to create task: {e}"))?;

    tasks::table
        .order(tasks::id.desc())
        .select(Task::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch task: {e}"))
}

#[tauri::command]
pub fn update_task_status(
    state: State<'_, DbState>,
    task_id: i32,
    status: String,
) -> Result<Task, String> {
    if !VALID_STATUSES.contains(&status.as_str()) {
        return Err(format!("Invalid status: {status}. Must be one of: {VALID_STATUSES:?}"));
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::update(tasks::table.filter(tasks::id.eq(task_id)))
        .set(tasks::status.eq(&status))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to update task status: {e}"))?;

    tasks::table
        .filter(tasks::id.eq(task_id))
        .select(Task::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch task: {e}"))
}

#[tauri::command]
pub fn archive_task(state: State<'_, DbState>, task_id: i32) -> Result<Task, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::update(tasks::table.filter(tasks::id.eq(task_id)))
        .set(tasks::status.eq("archived"))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to archive task: {e}"))?;

    tasks::table
        .filter(tasks::id.eq(task_id))
        .select(Task::as_select())
        .first(&mut *conn)
        .map_err(|e| format!("Failed to fetch task: {e}"))
}

#[tauri::command]
pub fn list_tasks_by_project(
    state: State<'_, DbState>,
    project_id: i32,
) -> Result<Vec<Task>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    tasks::table
        .filter(tasks::project_id.eq(project_id))
        .filter(tasks::status.ne("archived"))
        .select(Task::as_select())
        .order(tasks::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list tasks: {e}"))
}

#[tauri::command]
pub fn list_archived_tasks(state: State<'_, DbState>) -> Result<Vec<Task>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    tasks::table
        .filter(tasks::status.eq("archived"))
        .select(Task::as_select())
        .order(tasks::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list archived tasks: {e}"))
}

#[tauri::command]
pub fn delete_task(state: State<'_, DbState>, task_id: i32) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    diesel::delete(tasks::table.filter(tasks::id.eq(task_id)))
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to delete task: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn list_all_tasks(state: State<'_, DbState>) -> Result<Vec<Task>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    tasks::table
        .filter(tasks::status.ne("archived"))
        .select(Task::as_select())
        .order(tasks::created_at.desc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list tasks: {e}"))
}

#[tauri::command]
pub async fn simulate_task(app_handle: AppHandle, task_id: i32) -> Result<(), String> {
    // Set status to running
    {
        let db = app_handle.state::<DbState>();
        let mut conn = db.conn.lock().map_err(|e| e.to_string())?;

        diesel::update(tasks::table.filter(tasks::id.eq(task_id)))
            .set(tasks::status.eq("running"))
            .execute(&mut *conn)
            .map_err(|e| format!("Failed to set running: {e}"))?;
    }

    app_handle
        .emit(
            "task-status-changed",
            TaskStatusChanged {
                task_id,
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
            let _ = diesel::update(tasks::table.filter(tasks::id.eq(task_id)))
                .set(tasks::status.eq(new_status))
                .execute(&mut *conn);
        }

        let _ = handle.emit(
            "task-status-changed",
            TaskStatusChanged {
                task_id,
                status: new_status.to_string(),
            },
        );
    });

    Ok(())
}
