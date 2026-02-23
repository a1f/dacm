use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::schema::projects;

#[derive(Queryable, Selectable, Serialize, Debug)]
#[diesel(table_name = projects)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub description: String,
    pub summary: String,
    pub task_id: Option<String>,
    pub workspace_id: i32,
    pub status: String,
    pub start_time: Option<NaiveDateTime>,
    pub iteration_count: i32,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = projects)]
pub struct NewProject<'a> {
    pub name: &'a str,
    pub workspace_id: i32,
    pub description: &'a str,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProjectStatusChanged {
    pub project_id: i32,
    pub status: String,
}
