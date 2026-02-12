use diesel::prelude::*;
use serde::Serialize;

use crate::schema::settings;

#[derive(Queryable, Selectable, Serialize, Debug)]
#[diesel(table_name = settings)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[derive(Insertable, AsChangeset)]
#[diesel(table_name = settings)]
pub struct NewSetting<'a> {
    pub key: &'a str,
    pub value: &'a str,
}
