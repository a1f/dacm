use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

use crate::constants::DEFAULT_CLI;

pub struct SessionHandle {
    pub task_id: i32,
    pub project_id: i32,
    pub working_dir: String,
    pub pid: Option<u32>,
    pub started_at: std::time::Instant,
    pub started_at_epoch: u64,
    pub status: SessionStatus,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    reader_taken: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionStatus {
    Running,
    Exited,
}

#[derive(Serialize, Clone, Debug)]
pub struct SessionInfo {
    pub session_id: String,
    pub task_id: i32,
    pub project_id: i32,
    pub pid: Option<u32>,
    pub uptime_secs: u64,
    pub started_at_epoch: u64,
    pub status: String,
    pub working_dir: String,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn spawn(
        &self,
        task_id: i32,
        project_id: i32,
        working_dir: String,
        initial_prompt: Option<String>,
        cli_command: Option<String>,
        model: Option<String>,
        rows: u16,
        cols: u16,
    ) -> Result<String, String> {
        let program: &str = cli_command.as_deref().unwrap_or(DEFAULT_CLI);
        eprintln!("[session] Spawning {program} in dir: {working_dir}");

        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd = CommandBuilder::new(program);
        cmd.cwd(&working_dir);

        if let Some(ref m) = model {
            cmd.arg("--model");
            cmd.arg(m);
        }

        // Pass initial prompt as positional argument — CLI starts
        // an interactive session with that prompt pre-loaded
        if let Some(ref prompt) = initial_prompt {
            cmd.arg(prompt);
        }

        cmd.env("TERM", "xterm-256color");
        // Remove Claude Code's nesting guard so spawned sessions don't refuse to start
        cmd.env_remove("CLAUDECODE");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| {
                eprintln!("[session] Failed to spawn: {e}");
                format!("Failed to spawn claude: {e}")
            })?;

        let pid = child.process_id();
        eprintln!("[session] Spawned {program} pid={pid:?} size={rows}x{cols}");

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        let session_id = uuid::Uuid::new_v4().to_string();

        let handle = SessionHandle {
            task_id,
            project_id,
            working_dir,
            pid,
            started_at: std::time::Instant::now(),
            started_at_epoch: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            status: SessionStatus::Running,
            master: pair.master,
            writer,
            child,
            reader_taken: false,
        };

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), handle);

        drop(pair.slave);

        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        handle
            .writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;

        handle
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {e}"))
    }

    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        handle
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {e}"))
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        handle
            .child
            .kill()
            .map_err(|e| format!("Failed to kill session: {e}"))?;

        handle.status = SessionStatus::Exited;
        Ok(())
    }

    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_id, handle) in sessions.iter_mut() {
                let _ = handle.child.kill();
                handle.status = SessionStatus::Exited;
            }
        }
    }

    pub fn take_reader(
        &self,
        session_id: &str,
    ) -> Result<Box<dyn Read + Send>, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        if handle.reader_taken {
            return Err(format!("Reader already taken for session: {session_id}"));
        }

        handle.reader_taken = true;
        handle
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))
    }

    pub fn mark_exited(&self, session_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(handle) = sessions.get_mut(session_id) {
                handle.status = SessionStatus::Exited;
            }
        }
    }

    pub fn remove(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;
        Ok(())
    }

    pub fn get_pids(&self) -> Vec<u32> {
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        sessions
            .values()
            .filter_map(|h| h.pid)
            .collect()
    }

    pub fn list(&self) -> Result<Vec<SessionInfo>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let infos = sessions
            .iter()
            .map(|(id, handle)| SessionInfo {
                session_id: id.clone(),
                task_id: handle.task_id,
                project_id: handle.project_id,
                pid: handle.pid,
                uptime_secs: handle.started_at.elapsed().as_secs(),
                started_at_epoch: handle.started_at_epoch,
                status: match handle.status {
                    SessionStatus::Running => "running".to_string(),
                    SessionStatus::Exited => "exited".to_string(),
                },
                working_dir: handle.working_dir.clone(),
            })
            .collect();
        Ok(infos)
    }
}

impl Drop for SessionManager {
    fn drop(&mut self) {
        self.kill_all();
    }
}
