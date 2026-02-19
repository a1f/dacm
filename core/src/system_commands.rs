use serde::Serialize;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::State;

use crate::session::SessionManager;

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub memory_percent: f32,
    pub child_memory_mb: u64,
    pub child_count: u32,
}

#[tauri::command]
pub fn get_system_stats(session_mgr: State<'_, SessionManager>) -> Result<SystemStats, String> {
    let mut sys = System::new();
    sys.refresh_memory();

    let memory_used_mb = sys.used_memory() / (1024 * 1024);
    let memory_total_mb = sys.total_memory() / (1024 * 1024);
    let memory_percent = if memory_total_mb > 0 {
        (memory_used_mb as f32 / memory_total_mb as f32) * 100.0
    } else {
        0.0
    };

    // Gather PIDs of child sessions
    let child_pids = session_mgr.get_pids();

    // Refresh only the child processes to get their memory usage
    let pids_to_update: Vec<Pid> = child_pids.iter().map(|&p| Pid::from_u32(p)).collect();
    sys.refresh_processes(ProcessesToUpdate::Some(&pids_to_update), true);

    let mut child_memory_bytes: u64 = 0;
    for &pid in &child_pids {
        if let Some(proc) = sys.process(Pid::from_u32(pid)) {
            child_memory_bytes += proc.memory();
        }
    }
    let child_count = session_mgr.running_count();

    // Global CPU usage requires two snapshots — just use system-wide load average
    let load = System::load_average();
    let cpu_usage = load.one as f32;

    Ok(SystemStats {
        cpu_usage,
        memory_used_mb,
        memory_total_mb,
        memory_percent,
        child_memory_mb: child_memory_bytes / (1024 * 1024),
        child_count,
    })
}
