use std::{path::PathBuf, time::Duration};

use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{
    commands::ChangeEvent,
    domain::errors::{AppError, ErrorPayload},
    services::backup_service::{
        ImportMode, ImportPreviewSummary, ImportResult, commit_import,
        commit_replace_with_safety_backup, export_document, parse_backup_bytes, preview_summary,
        write_document_atomic,
    },
    state::{AppState, PendingImport},
};

type CommandResult<T> = Result<T, ErrorPayload>;
const PREVIEW_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub cancelled: bool,
    pub path: Option<String>,
    pub prompt_count: usize,
    pub category_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub cancelled: bool,
    pub token: Option<String>,
    pub summary: Option<ImportPreviewSummary>,
}

fn json_path(path: String) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(path);
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err(AppError::Validation(
            "请选择扩展名为 .json 的文件".to_string(),
        ));
    }
    Ok(path)
}

#[tauri::command]
pub async fn export_backup(
    state: State<'_, AppState>,
    destination_path: Option<String>,
) -> CommandResult<ExportResult> {
    let Some(destination_path) = destination_path else {
        return Ok(ExportResult {
            cancelled: true,
            path: None,
            prompt_count: 0,
            category_count: 0,
        });
    };
    let path = json_path(destination_path)?;
    let document = export_document(state.database.pool()).await?;
    write_document_atomic(&path, &document)?;
    Ok(ExportResult {
        cancelled: false,
        path: Some(path.to_string_lossy().into_owned()),
        prompt_count: document.prompts.len(),
        category_count: document.categories.len(),
    })
}

#[tauri::command]
pub async fn preview_import_backup(
    state: State<'_, AppState>,
    source_path: Option<String>,
) -> CommandResult<PreviewResult> {
    let Some(source_path) = source_path else {
        return Ok(PreviewResult {
            cancelled: true,
            token: None,
            summary: None,
        });
    };
    let path = json_path(source_path)?;
    let bytes = std::fs::read(path).map_err(AppError::from)?;
    let document = parse_backup_bytes(&bytes)?;
    let summary = preview_summary(state.database.pool(), &document).await?;
    let token = Uuid::new_v4().to_string();
    let mut pending = state
        .pending_imports
        .lock()
        .map_err(|_| AppError::Conflict("导入预览缓存不可用".to_string()))?;
    pending.retain(|_, value| value.created_at.elapsed() < PREVIEW_TTL);
    pending.insert(
        token.clone(),
        PendingImport {
            document,
            created_at: std::time::Instant::now(),
        },
    );
    Ok(PreviewResult {
        cancelled: false,
        token: Some(token),
        summary: Some(summary),
    })
}

#[tauri::command]
pub async fn commit_import_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    token: String,
    mode: ImportMode,
) -> CommandResult<ImportResult> {
    let pending = state
        .pending_imports
        .lock()
        .map_err(|_| AppError::Conflict("导入预览缓存不可用".to_string()))?
        .remove(&token)
        .ok_or_else(|| AppError::Conflict("导入预览已失效，请重新选择文件".to_string()))?;
    if pending.created_at.elapsed() >= PREVIEW_TTL {
        return Err(AppError::Conflict("导入预览已超过 10 分钟".to_string()).into());
    }

    let result = if matches!(mode, ImportMode::Replace) {
        let directory = state
            .database_path
            .parent()
            .ok_or_else(|| AppError::Validation("应用数据目录无效".to_string()))?
            .join("safety-backups");
        let path = directory.join(format!(
            "PromptDock_before_replace_{}.json",
            Utc::now().format("%Y-%m-%d_%H-%M-%S")
        ));
        commit_replace_with_safety_backup(state.database.pool(), &pending.document, &path).await?
    } else {
        commit_import(state.database.pool(), &pending.document, mode).await?
    };
    let _ = app.emit(
        "prompts-changed",
        ChangeEvent {
            entity: "backup",
            action: "imported",
            id: None,
        },
    );
    Ok(result)
}

#[tauri::command]
pub fn cancel_import_backup(state: State<'_, AppState>, token: String) -> CommandResult<()> {
    state
        .pending_imports
        .lock()
        .map_err(|_| AppError::Conflict("导入预览缓存不可用".to_string()))?
        .remove(&token);
    Ok(())
}
