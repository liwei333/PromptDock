pub mod backup;
pub mod categories;
pub mod prompts;
pub mod windows;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEvent {
    pub entity: &'static str,
    pub action: &'static str,
    pub id: Option<String>,
}
