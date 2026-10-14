use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
    time::Instant,
};

use serde::Serialize;

use crate::db::Database;
use crate::services::backup_service::BackupDocument;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DesktopPlatform {
    MacOs,
    Windows,
    Other,
}

pub(crate) const fn shortcut_configuration(
    platform: DesktopPlatform,
) -> (&'static str, &'static str) {
    match platform {
        DesktopPlatform::MacOs => ("Alt+Space", "Option+Space"),
        DesktopPlatform::Windows | DesktopPlatform::Other => ("Ctrl+Alt+Space", "Ctrl+Alt+Space"),
    }
}

pub(crate) const fn current_shortcut_configuration() -> (&'static str, &'static str) {
    if cfg!(target_os = "macos") {
        shortcut_configuration(DesktopPlatform::MacOs)
    } else if cfg!(target_os = "windows") {
        shortcut_configuration(DesktopPlatform::Windows)
    } else {
        shortcut_configuration(DesktopPlatform::Other)
    }
}

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
            accelerator: current_shortcut_configuration().1.to_string(),
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
    pub mode_transition: Arc<tokio::sync::Mutex<()>>,
}

impl AppState {
    pub fn new(database: Database, database_path: PathBuf) -> Self {
        Self {
            database,
            database_path,
            shortcut: Arc::new(RwLock::new(ShortcutStatus::default())),
            pending_imports: Arc::new(Mutex::new(HashMap::new())),
            mode_transition: Arc::new(tokio::sync::Mutex::new(())),
        }
    }
}
