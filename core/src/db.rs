use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::path::Path;
use std::sync::Mutex;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub struct DbState {
    pub conn: Mutex<SqliteConnection>,
}

pub fn init_db(app_data_dir: &Path) -> Result<DbState, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(app_data_dir)?;

    let db_path = app_data_dir.join("dacm.db");
    let db_url = db_path.to_string_lossy().to_string();

    let mut conn = SqliteConnection::establish(&db_url)?;

    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|e| format!("Migration error: {e}"))?;

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}
