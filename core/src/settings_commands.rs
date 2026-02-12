use diesel::prelude::*;
use tauri::State;

use crate::db::DbState;
use crate::schema::settings;
use crate::settings_models::{NewSetting, Setting};

#[tauri::command]
pub fn get_setting(state: State<'_, DbState>, key: String) -> Result<String, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    settings::table
        .filter(settings::key.eq(&key))
        .select(settings::value)
        .first::<String>(&mut *conn)
        .map_err(|e| format!("Failed to get setting '{key}': {e}"))
}

#[tauri::command]
pub fn set_setting(state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let new_setting = NewSetting {
        key: &key,
        value: &value,
    };

    diesel::replace_into(settings::table)
        .values(&new_setting)
        .execute(&mut *conn)
        .map_err(|e| format!("Failed to set setting '{key}': {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn list_settings(state: State<'_, DbState>) -> Result<Vec<Setting>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    settings::table
        .select(Setting::as_select())
        .order(settings::key.asc())
        .load(&mut *conn)
        .map_err(|e| format!("Failed to list settings: {e}"))
}
