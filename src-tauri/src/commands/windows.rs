use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    domain::errors::{AppError, ErrorPayload},
    state::{AppState, ShortcutStatus},
    window_mode::{
        TauriWindowModeRuntime, WindowMode, WindowModeRuntime, hide_sticky_explicitly,
        set_sticky_preferences, transition_to,
    },
};

type CommandResult<T> = Result<T, ErrorPayload>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum StickyDensity {
    #[default]
    Comfortable,
    Compact,
}

impl StickyDensity {
    pub(crate) fn logical_size(self) -> (f64, f64) {
        match self {
            Self::Comfortable => (420.0, 695.0),
            Self::Compact => (340.0, 270.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickySettings {
    pub visible: bool,
    pub always_on_top: bool,
    #[serde(default)]
    pub density: StickyDensity,
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
            density: StickyDensity::Comfortable,
            x: None,
            y: None,
            monitor_name: None,
            scale_factor: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StickySettingsPatch {
    pub always_on_top: Option<bool>,
    pub density: Option<StickyDensity>,
}

#[derive(Debug, Serialize)]
pub struct ModeResult {
    pub mode: WindowMode,
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
pub async fn enter_sticky_mode(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ModeResult> {
    let runtime = TauriWindowModeRuntime::new(app, state.inner().clone());
    transition_to(&runtime, &state.mode_transition, WindowMode::Sticky).await?;
    Ok(ModeResult {
        mode: WindowMode::Sticky,
    })
}

#[tauri::command]
pub async fn enter_main_mode(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ModeResult> {
    let runtime = TauriWindowModeRuntime::new(app, state.inner().clone());
    transition_to(&runtime, &state.mode_transition, WindowMode::Main).await?;
    Ok(ModeResult {
        mode: WindowMode::Main,
    })
}

#[tauri::command]
pub async fn hide_sticky_window(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<HiddenResult> {
    let runtime = TauriWindowModeRuntime::new(app, state.inner().clone());
    hide_sticky_explicitly(&runtime, &state.mode_transition).await?;
    Ok(HiddenResult { hidden: true })
}

#[tauri::command]
pub async fn get_sticky_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<StickySettings> {
    TauriWindowModeRuntime::new(app, state.inner().clone())
        .read_settings()
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn set_sticky_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: StickySettingsPatch,
) -> CommandResult<StickySettings> {
    let runtime = TauriWindowModeRuntime::new(app, state.inner().clone());
    match (settings.always_on_top, settings.density) {
        (None, None) => {
            let _guard = state.mode_transition.lock().await;
            runtime.read_settings().await.map_err(Into::into)
        }
        (Some(always_on_top), None) => crate::window_mode::set_sticky_always_on_top(
            &runtime,
            &state.mode_transition,
            always_on_top,
        )
        .await
        .map_err(Into::into),
        (None, Some(density)) => {
            crate::window_mode::set_sticky_density(&runtime, &state.mode_transition, density)
                .await
                .map_err(Into::into)
        }
        (always_on_top, density) => {
            set_sticky_preferences(&runtime, &state.mode_transition, always_on_top, density)
                .await
                .map_err(Into::into)
        }
    }
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

#[cfg(test)]
mod tests {
    use super::StickySettingsPatch;

    #[test]
    fn sticky_settings_patch_rejects_visibility_position_and_unknown_fields() {
        for value in [
            serde_json::json!({ "visible": true }),
            serde_json::json!({ "x": 10 }),
            serde_json::json!({ "y": 20 }),
            serde_json::json!({ "monitorName": "Display" }),
            serde_json::json!({ "scaleFactor": 2.0 }),
            serde_json::json!({ "unexpected": true }),
        ] {
            assert!(
                serde_json::from_value::<StickySettingsPatch>(value.clone()).is_err(),
                "frontend settings must reject {value}"
            );
        }
    }

    #[test]
    fn sticky_settings_patch_accepts_only_optional_top_preference() {
        let patch: StickySettingsPatch =
            serde_json::from_value(serde_json::json!({ "alwaysOnTop": false })).unwrap();
        assert_eq!(patch.always_on_top, Some(false));
        let empty: StickySettingsPatch = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(empty.always_on_top, None);
        assert_eq!(empty.density, None);
    }

    #[test]
    fn sticky_settings_are_backward_compatible_and_density_patch_is_typed() {
        let settings: super::StickySettings = serde_json::from_value(serde_json::json!({
            "visible": true,
            "alwaysOnTop": true,
            "x": null,
            "y": null,
            "monitorName": null,
            "scaleFactor": null
        }))
        .unwrap();
        assert_eq!(settings.density, super::StickyDensity::Comfortable);

        let patch: StickySettingsPatch =
            serde_json::from_value(serde_json::json!({ "density": "compact" })).unwrap();
        assert_eq!(patch.density, Some(super::StickyDensity::Compact));
        assert!(
            serde_json::from_value::<StickySettingsPatch>(
                serde_json::json!({ "density": "oversized" })
            )
            .is_err()
        );
    }
}
