use std::process::{Child, Command};
use std::sync::Mutex;

pub struct SleepState {
    pub child: Mutex<Option<Child>>,
}

impl SleepState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }
    }
}

#[tauri::command]
pub fn set_prevent_sleep(
    state: tauri::State<'_, SleepState>,
    prevent: bool,
) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;

    // Kill existing process if any
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;

    if prevent {
        let child = Command::new("caffeinate")
            .args(["-d", "-i"])
            .spawn()
            .map_err(|e| format!("Failed to start caffeinate: {e}"))?;
        *guard = Some(child);
    }

    Ok(())
}
