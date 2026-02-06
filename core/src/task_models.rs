use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::schema::tasks;

#[derive(Queryable, Selectable, Serialize, Debug)]
#[diesel(table_name = tasks)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Task {
    pub id: i32,
    pub name: String,
    pub description: String,
    pub summary: String,
    pub task_id: Option<String>,
    pub project_id: i32,
    pub status: String,
    pub start_time: Option<NaiveDateTime>,
    pub iteration_count: i32,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = tasks)]
pub struct NewTask<'a> {
    pub name: &'a str,
    pub project_id: i32,
    pub description: &'a str,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskStatusChanged {
    pub task_id: i32,
    pub status: String,
}
