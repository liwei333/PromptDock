use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
    time::Instant,
};

use serde::Serialize;

use crate::db::Database;
use crate::services::backup_service::BackupDocument;

#[derive(Clone)]
pub struct PendingImport {
    pub document: BackupDocument,
    pub created_at: Instant,
}

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
    pub pending_imports: Arc<Mutex<HashMap<String, PendingImport>>>,
}

impl AppState {
    pub fn new(database: Database, database_path: PathBuf) -> Self {
        Self {
            database,
            database_path,
            shortcut: Arc::new(RwLock::new(ShortcutStatus::default())),
            pending_imports: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
