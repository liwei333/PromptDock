use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
    time::Instant,
};

use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::services::backup_service::BackupDocument;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MainIntent {
    ManageSticky,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMainIntent {
    pub id: u32,
    pub intent: MainIntent,
}

#[derive(Debug, Default)]
pub struct MainIntentSlot {
    next_id: u32,
    pending: Option<PendingMainIntent>,
}

impl MainIntentSlot {
    pub(crate) fn assign(&mut self, intent: MainIntent) -> PendingMainIntent {
        self.next_id = self
            .next_id
            .checked_add(1)
            .expect("main intent sequence overflow");
        let pending = PendingMainIntent {
            id: self.next_id,
            intent,
        };
        self.pending = Some(pending.clone());
        pending
    }

    pub(crate) fn peek(&self) -> Option<PendingMainIntent> {
        self.pending.clone()
    }

    pub(crate) fn clear_if(&mut self, id: u32) -> bool {
        if self
            .pending
            .as_ref()
            .is_some_and(|pending| pending.id == id)
        {
            self.pending = None;
            return true;
        }
        false
    }
}

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
    pub pending_main_intent: Arc<tokio::sync::Mutex<MainIntentSlot>>,
}

impl AppState {
    pub fn new(database: Database, database_path: PathBuf) -> Self {
        Self {
            database,
            database_path,
            shortcut: Arc::new(RwLock::new(ShortcutStatus::default())),
            pending_imports: Arc::new(Mutex::new(HashMap::new())),
            mode_transition: Arc::new(tokio::sync::Mutex::new(())),
            pending_main_intent: Arc::new(tokio::sync::Mutex::new(MainIntentSlot::default())),
        }
    }
}
