use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};

use crate::{
    domain::errors::{AppError, ErrorPayload},
    repositories::settings_repo::SettingsRepository,
    state::{AppState, ShortcutStatus},
};

type CommandResult<T> = Result<T, ErrorPayload>;
const STICKY_SETTINGS_KEY: &str = "sticky_window";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickySettings {
    pub visible: bool,
    pub always_on_top: bool,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub monitor_name: Option<String>,
    pub scale_factor: Option<f64>,
}

impl Default for StickySettings {
    fn default() -> Self {
        Self {
            visible: false,
            always_on_top: true,
            x: None,
            y: None,
            monitor_name: None,
            scale_factor: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickySettingsPatch {
    pub visible: Option<bool>,
    pub always_on_top: Option<bool>,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub monitor_name: Option<String>,
    pub scale_factor: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ShownResult {
    pub shown: bool,
}

#[derive(Debug, Serialize)]
pub struct HiddenResult {
    pub hidden: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub db_path: String,
    pub version: &'static str,
    pub shortcut: ShortcutStatus,
}

fn native_error(error: impl ToString) -> ErrorPayload {
    AppError::Native(error.to_string()).into()
}

pub(crate) async fn read_sticky_settings(state: &AppState) -> Result<StickySettings, AppError> {
    let repository = SettingsRepository::new(state.database.pool().clone());
    repository
        .get(STICKY_SETTINGS_KEY)
        .await?
        .map(serde_json::from_value)
        .transpose()
        .map_err(Into::into)
        .map(|value| value.unwrap_or_default())
}

pub(crate) async fn write_sticky_settings(
    state: &AppState,
    settings: &StickySettings,
) -> Result<(), AppError> {
    SettingsRepository::new(state.database.pool().clone())
        .set(STICKY_SETTINGS_KEY, &serde_json::to_value(settings)?)
        .await
}

pub(crate) async fn capture_sticky_window_state(
    app: &AppHandle,
    state: &AppState,
    visible: bool,
) -> Result<StickySettings, AppError> {
    let window = app
        .get_webview_window("sticky")
        .ok_or_else(|| AppError::Native("找不到便签窗口".to_string()))?;
    let mut settings = read_sticky_settings(state).await?;
    settings.visible = visible;
    if let Ok(position) = window.outer_position() {
        settings.x = Some(position.x);
        settings.y = Some(position.y);
    }
    settings.scale_factor = window.scale_factor().ok();
    settings.monitor_name = window
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().map(ToOwned::to_owned));
    write_sticky_settings(state, &settings).await?;
    Ok(settings)
}

pub(crate) async fn restore_sticky_window(
    app: &AppHandle,
    state: &AppState,
) -> Result<(), AppError> {
    let settings = read_sticky_settings(state).await?;
    let window = app
        .get_webview_window("sticky")
        .ok_or_else(|| AppError::Native("找不到便签窗口".to_string()))?;
    window
        .set_always_on_top(settings.always_on_top)
        .map_err(|error| AppError::Native(error.to_string()))?;
    if let (Some(x), Some(y)) = (settings.x, settings.y) {
        let size = window
            .outer_size()
            .map_err(|error| AppError::Native(error.to_string()))?;
        let monitor = window
            .available_monitors()
            .map_err(|error| AppError::Native(error.to_string()))?
            .into_iter()
            .find(|monitor| monitor.name().map(String::as_str) == settings.monitor_name.as_deref())
            .or_else(|| window.current_monitor().ok().flatten());
        if let Some(monitor) = monitor {
            let origin = monitor.position();
            let area = monitor.size();
            let max_x = origin.x + area.width.saturating_sub(size.width) as i32;
            let max_y = origin.y + area.height.saturating_sub(size.height) as i32;
            window
                .set_position(PhysicalPosition::new(
                    x.clamp(origin.x, max_x),
                    y.clamp(origin.y, max_y),
                ))
                .map_err(|error| AppError::Native(error.to_string()))?;
        }
    }
    if settings.visible {
        window
            .show()
            .map_err(|error| AppError::Native(error.to_string()))?;
    }
    Ok(())
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn reveal_quick_window(app: &AppHandle, prompt_id: Option<String>) -> Result<(), AppError> {
    let window = app
        .get_webview_window("quick")
        .ok_or_else(|| AppError::Native("找不到快速搜索窗口".to_string()))?;
    if let Some(id) = prompt_id {
        let _ = window.emit("quick-select-prompt", id);
    }
    window
        .center()
        .map_err(|error| AppError::Native(error.to_string()))?;
    window
        .show()
        .map_err(|error| AppError::Native(error.to_string()))?;
    window
        .set_focus()
        .map_err(|error| AppError::Native(error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn show_quick_window(app: AppHandle, prompt_id: Option<String>) -> CommandResult<ShownResult> {
    reveal_quick_window(&app, prompt_id).map_err(ErrorPayload::from)?;
    Ok(ShownResult { shown: true })
}

#[tauri::command]
pub fn hide_quick_window(app: AppHandle) -> CommandResult<HiddenResult> {
    let window = app
        .get_webview_window("quick")
        .ok_or_else(|| native_error("找不到快速搜索窗口"))?;
    window.hide().map_err(native_error)?;
    Ok(HiddenResult { hidden: true })
}

#[tauri::command]
pub async fn show_sticky_window(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ShownResult> {
    let window = app
        .get_webview_window("sticky")
        .ok_or_else(|| native_error("找不到便签窗口"))?;
    let mut settings = read_sticky_settings(&state).await?;
    window
        .set_always_on_top(settings.always_on_top)
        .map_err(native_error)?;
    if let (Some(x), Some(y)) = (settings.x, settings.y) {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(native_error)?;
    }
    window.show().map_err(native_error)?;
    settings.visible = true;
    write_sticky_settings(&state, &settings).await?;
    Ok(ShownResult { shown: true })
}

#[tauri::command]
pub async fn hide_sticky_window(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<HiddenResult> {
    let window = app
        .get_webview_window("sticky")
        .ok_or_else(|| native_error("找不到便签窗口"))?;
    capture_sticky_window_state(&app, &state, false).await?;
    window.hide().map_err(native_error)?;
    Ok(HiddenResult { hidden: true })
}

#[tauri::command]
pub async fn get_sticky_settings(state: State<'_, AppState>) -> CommandResult<StickySettings> {
    read_sticky_settings(&state).await.map_err(Into::into)
}

#[tauri::command]
pub async fn set_sticky_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: StickySettingsPatch,
) -> CommandResult<StickySettings> {
    let mut current = read_sticky_settings(&state).await?;
    if let Some(value) = settings.visible {
        current.visible = value;
    }
    if let Some(value) = settings.always_on_top {
        current.always_on_top = value;
    }
    if let Some(value) = settings.x {
        current.x = Some(value);
    }
    if let Some(value) = settings.y {
        current.y = Some(value);
    }
    if let Some(value) = settings.monitor_name {
        current.monitor_name = Some(value);
    }
    if let Some(value) = settings.scale_factor {
        current.scale_factor = Some(value);
    }

    if let Some(window) = app.get_webview_window("sticky") {
        window
            .set_always_on_top(current.always_on_top)
            .map_err(native_error)?;
        match current.visible {
            true => window.show().map_err(native_error)?,
            false => window.hide().map_err(native_error)?,
        }
        if let (Some(x), Some(y)) = (current.x, current.y) {
            window
                .set_position(PhysicalPosition::new(x, y))
                .map_err(native_error)?;
        }
    }
    write_sticky_settings(&state, &current).await?;
    Ok(current)
}

#[tauri::command]
pub fn get_runtime_info(state: State<'_, AppState>) -> RuntimeInfo {
    let shortcut = state
        .shortcut
        .read()
        .map(|status| status.clone())
        .unwrap_or_else(|_| ShortcutStatus {
            error: Some("快捷键状态锁不可用".to_string()),
            ..ShortcutStatus::default()
        });
    RuntimeInfo {
        db_path: state.database_path.to_string_lossy().into_owned(),
        version: env!("CARGO_PKG_VERSION"),
        shortcut,
    }
}
