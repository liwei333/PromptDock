use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};

use serde::Serialize;

use crate::db::Database;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub accelerator: String,
    pub registered: bool,
    pub error: Option<String>,
}

impl Default for ShortcutStatus {
    fn default() -> Self {
        Self {
            accelerator: "Option+Space".to_string(),
            registered: false,
            error: None,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub database_path: PathBuf,
    pub shortcut: Arc<RwLock<ShortcutStatus>>,
}

impl AppState {
    pub fn new(database: Database, database_path: PathBuf) -> Self {
        Self {
            database,
            database_path,
            shortcut: Arc::new(RwLock::new(ShortcutStatus::default())),
        }
    }
}
