use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::workspaces;

#[derive(Queryable, Selectable, Serialize, Debug)]
#[diesel(table_name = workspaces)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Workspace {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = workspaces)]
pub struct NewWorkspace<'a> {
    pub name: &'a str,
    pub path: &'a str,
}
