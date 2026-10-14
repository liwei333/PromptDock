use std::future::Future;

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tokio::sync::Mutex;

use crate::{
    commands::windows::StickySettings, domain::errors::AppError,
    repositories::settings_repo::SettingsRepository, state::AppState,
};

const STICKY_SETTINGS_KEY: &str = "sticky_window";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowMode {
    Main,
    Sticky,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProductWindow {
    Main,
    Sticky,
}

#[derive(Debug, Clone)]
pub(crate) struct ModeSnapshot {
    pub main_visible: bool,
    pub sticky_visible: bool,
    pub settings: StickySettings,
}

pub(crate) trait WindowModeRuntime: Send + Sync {
    fn read_settings(&self) -> impl Future<Output = Result<StickySettings, AppError>> + Send;
    fn write_settings<'a>(
        &'a self,
        settings: &'a StickySettings,
    ) -> impl Future<Output = Result<(), AppError>> + Send + 'a;
    fn is_visible(&self, window: ProductWindow) -> Result<bool, AppError>;
    fn show(&self, window: ProductWindow) -> Result<(), AppError>;
    fn hide(&self, window: ProductWindow) -> Result<(), AppError>;
    fn focus(&self, window: ProductWindow) -> Result<(), AppError>;
    fn unminimize(&self, window: ProductWindow) -> Result<(), AppError>;
    fn configure_sticky(&self, settings: &StickySettings) -> Result<(), AppError>;
    fn capture_sticky_position(&self, settings: &mut StickySettings) -> Result<(), AppError>;
    fn set_sticky_always_on_top(&self, value: bool) -> Result<(), AppError>;
}

pub(crate) struct TauriWindowModeRuntime {
    app: AppHandle,
    state: AppState,
}

impl TauriWindowModeRuntime {
    pub(crate) fn new(app: AppHandle, state: AppState) -> Self {
        Self { app, state }
    }

    fn window(&self, window: ProductWindow) -> Result<WebviewWindow, AppError> {
        let (label, message) = match window {
            ProductWindow::Main => ("main", "找不到主窗口"),
            ProductWindow::Sticky => ("sticky", "找不到便签窗口"),
        };
        self.app
            .get_webview_window(label)
            .ok_or_else(|| AppError::Native(message.to_string()))
    }
}

impl WindowModeRuntime for TauriWindowModeRuntime {
    async fn read_settings(&self) -> Result<StickySettings, AppError> {
        SettingsRepository::new(self.state.database.pool().clone())
            .get(STICKY_SETTINGS_KEY)
            .await?
            .map(serde_json::from_value)
            .transpose()
            .map_err(Into::into)
            .map(|value| value.unwrap_or_default())
    }

    async fn write_settings(&self, settings: &StickySettings) -> Result<(), AppError> {
        SettingsRepository::new(self.state.database.pool().clone())
            .set(STICKY_SETTINGS_KEY, &serde_json::to_value(settings)?)
            .await
    }

    fn is_visible(&self, window: ProductWindow) -> Result<bool, AppError> {
        self.window(window)?
            .is_visible()
            .map_err(|_| AppError::Native("无法读取窗口可见状态".to_string()))
    }

    fn show(&self, window: ProductWindow) -> Result<(), AppError> {
        self.window(window)?
            .show()
            .map_err(|_| AppError::Native("无法显示窗口".to_string()))
    }

    fn hide(&self, window: ProductWindow) -> Result<(), AppError> {
        self.window(window)?
            .hide()
            .map_err(|_| AppError::Native("无法隐藏窗口".to_string()))
    }

    fn focus(&self, window: ProductWindow) -> Result<(), AppError> {
        self.window(window)?
            .set_focus()
            .map_err(|_| AppError::Native("无法聚焦窗口".to_string()))
    }

    fn unminimize(&self, window: ProductWindow) -> Result<(), AppError> {
        self.window(window)?
            .unminimize()
            .map_err(|_| AppError::Native("无法恢复最小化窗口".to_string()))
    }

    fn configure_sticky(&self, settings: &StickySettings) -> Result<(), AppError> {
        self.set_sticky_always_on_top(settings.always_on_top)?;
        let (Some(x), Some(y)) = (settings.x, settings.y) else {
            return Ok(());
        };
        let window = self.window(ProductWindow::Sticky)?;
        let saved_monitor = match settings.monitor_name.as_deref() {
            Some(name) => window
                .available_monitors()
                .map_err(|_| AppError::Native("无法读取显示器列表".to_string()))?
                .into_iter()
                .find(|monitor| monitor.name().map(String::as_str) == Some(name)),
            None => None,
        };
        let monitor = match saved_monitor {
            Some(monitor) => Some(monitor),
            None => window
                .current_monitor()
                .map_err(|_| AppError::Native("无法读取便签所在显示器".to_string()))?,
        };
        if let Some(monitor) = monitor {
            let origin = monitor.position();
            let area = monitor.size();
            if area.width == 0 || area.height == 0 {
                return Ok(());
            }
            let size = window
                .outer_size()
                .map_err(|_| AppError::Native("无法读取便签窗口尺寸".to_string()))?;
            let clamp_axis = |value: i32, origin: i32, available: u32, size: u32| {
                let maximum = i64::from(origin) + i64::from(available.saturating_sub(size));
                i64::from(value).clamp(i64::from(origin), maximum) as i32
            };
            window
                .set_position(PhysicalPosition::new(
                    clamp_axis(x, origin.x, area.width, size.width),
                    clamp_axis(y, origin.y, area.height, size.height),
                ))
                .map_err(|_| AppError::Native("无法恢复便签窗口位置".to_string()))?;
        }
        Ok(())
    }

    fn capture_sticky_position(&self, settings: &mut StickySettings) -> Result<(), AppError> {
        let window = self.window(ProductWindow::Sticky)?;
        let position = window
            .outer_position()
            .map_err(|_| AppError::Native("无法读取便签窗口位置".to_string()))?;
        let scale_factor = window
            .scale_factor()
            .map_err(|_| AppError::Native("无法读取便签窗口缩放比例".to_string()))?;
        let monitor = window
            .current_monitor()
            .map_err(|_| AppError::Native("无法读取便签所在显示器".to_string()))?;
        settings.x = Some(position.x);
        settings.y = Some(position.y);
        settings.monitor_name = monitor.and_then(|monitor| monitor.name().cloned());
        settings.scale_factor = Some(scale_factor);
        Ok(())
    }

    fn set_sticky_always_on_top(&self, value: bool) -> Result<(), AppError> {
        self.window(ProductWindow::Sticky)?
            .set_always_on_top(value)
            .map_err(|_| AppError::Native("无法设置便签窗口置顶".to_string()))
    }
}

pub(crate) async fn transition_to(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
    target: WindowMode,
) -> Result<(), AppError> {
    let _guard = mutex.lock().await;
    let snapshot = snapshot_mode(runtime).await?;
    transition_from_snapshot(runtime, snapshot, target).await
}

pub(crate) async fn persist_sticky_position(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
) -> Result<StickySettings, AppError> {
    let _guard = mutex.lock().await;
    let original = runtime.read_settings().await?;
    let mut settings = original.clone();
    runtime.capture_sticky_position(&mut settings)?;
    // A moved event owns only the position fields, even if capture returned stale preferences.
    settings.visible = original.visible;
    settings.always_on_top = original.always_on_top;
    if let Err(error) = runtime.write_settings(&settings).await {
        let rollback = restore_settings_if_attempted(runtime, &original, true).await;
        return Err(transition_error(error, rollback));
    }
    Ok(settings)
}

pub(crate) async fn set_sticky_always_on_top(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
    value: bool,
) -> Result<StickySettings, AppError> {
    let _guard = mutex.lock().await;
    let original = runtime.read_settings().await?;
    let mut settings = original.clone();
    settings.always_on_top = value;
    let mut persistence_attempted = false;
    let result = async {
        runtime.set_sticky_always_on_top(value)?;
        persistence_attempted = true;
        runtime.write_settings(&settings).await
    }
    .await;
    if let Err(error) = result {
        let mut rollback =
            restore_settings_if_attempted(runtime, &original, persistence_attempted).await;
        record_rollback_error(
            &mut rollback,
            "restore_always_on_top",
            runtime.set_sticky_always_on_top(original.always_on_top),
        );
        return Err(transition_error(error, rollback));
    }
    Ok(settings)
}

pub(crate) async fn hide_sticky_explicitly(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
) -> Result<(), AppError> {
    let _guard = mutex.lock().await;
    let snapshot = snapshot_mode(runtime).await?;
    let mut settings = snapshot.settings.clone();
    let mut persistence_attempted = false;
    let result = async {
        runtime.capture_sticky_position(&mut settings)?;
        settings.visible = false;
        persistence_attempted = true;
        runtime.write_settings(&settings).await?;
        runtime.hide(ProductWindow::Sticky)
    }
    .await;
    if let Err(error) = result {
        let rollback = compensate_snapshot(runtime, &snapshot, persistence_attempted).await;
        return Err(transition_error(error, rollback));
    }
    Ok(())
}

pub(crate) async fn toggle_product_mode(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
) -> Result<WindowMode, AppError> {
    let _guard = mutex.lock().await;
    let snapshot = snapshot_mode(runtime).await?;
    let target = if snapshot.sticky_visible {
        WindowMode::Main
    } else {
        WindowMode::Sticky
    };
    transition_from_snapshot(runtime, snapshot, target).await?;
    Ok(target)
}

pub(crate) async fn reconcile_startup_mode(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
) -> Result<(), AppError> {
    let _guard = mutex.lock().await;
    let snapshot = snapshot_mode(runtime).await?;
    let target = if snapshot.settings.visible {
        WindowMode::Sticky
    } else {
        // Restore the hidden sticky before Main captures its position for persistence.
        runtime.configure_sticky(&snapshot.settings)?;
        WindowMode::Main
    };
    transition_from_snapshot(runtime, snapshot, target).await
}

pub(crate) async fn snapshot_mode(
    runtime: &impl WindowModeRuntime,
) -> Result<ModeSnapshot, AppError> {
    Ok(ModeSnapshot {
        main_visible: runtime.is_visible(ProductWindow::Main)?,
        sticky_visible: runtime.is_visible(ProductWindow::Sticky)?,
        settings: runtime.read_settings().await?,
    })
}

/// The caller must hold the shared transition mutex from snapshot through completion.
/// Startup and other callers already holding that mutex must not acquire it again.
pub(crate) async fn transition_from_snapshot(
    runtime: &impl WindowModeRuntime,
    snapshot: ModeSnapshot,
    target: WindowMode,
) -> Result<(), AppError> {
    let mut settings = snapshot.settings.clone();
    let mut persistence_attempted = false;
    let result = async {
        let source = match target {
            WindowMode::Sticky => {
                runtime.configure_sticky(&settings)?;
                runtime.show(ProductWindow::Sticky)?;
                runtime.focus(ProductWindow::Sticky)?;
                settings.visible = true;
                ProductWindow::Main
            }
            WindowMode::Main => {
                runtime.show(ProductWindow::Main)?;
                runtime.unminimize(ProductWindow::Main)?;
                runtime.focus(ProductWindow::Main)?;
                runtime.capture_sticky_position(&mut settings)?;
                settings.visible = false;
                ProductWindow::Sticky
            }
        };
        // A failed write may already have changed persistence, so compensation starts here.
        persistence_attempted = true;
        runtime.write_settings(&settings).await?;
        runtime.hide(source)
    }
    .await;
    if let Err(error) = result {
        let rollback = compensate_snapshot(runtime, &snapshot, persistence_attempted).await;
        return Err(transition_error(error, rollback));
    }
    Ok(())
}

async fn compensate_snapshot(
    runtime: &impl WindowModeRuntime,
    snapshot: &ModeSnapshot,
    persistence_attempted: bool,
) -> Vec<String> {
    let mut errors =
        restore_settings_if_attempted(runtime, &snapshot.settings, persistence_attempted).await;
    // Both restores are attempted independently, including intentional zero-window snapshots.
    for (window, visible, operation) in [
        (
            ProductWindow::Main,
            snapshot.main_visible,
            "restore_main_visibility",
        ),
        (
            ProductWindow::Sticky,
            snapshot.sticky_visible,
            "restore_sticky_visibility",
        ),
    ] {
        let result = if visible {
            runtime.show(window)
        } else {
            runtime.hide(window)
        };
        record_rollback_error(&mut errors, operation, result);
    }
    errors
}

async fn restore_settings_if_attempted(
    runtime: &impl WindowModeRuntime,
    settings: &StickySettings,
    persistence_attempted: bool,
) -> Vec<String> {
    let mut errors = Vec::new();
    if persistence_attempted {
        record_rollback_error(
            &mut errors,
            "restore_settings",
            runtime.write_settings(settings).await,
        );
    }
    errors
}

fn record_rollback_error(
    errors: &mut Vec<String>,
    operation: &'static str,
    result: Result<(), AppError>,
) {
    if let Err(error) = result {
        // Keep rollback diagnostics useful without including native messages or user settings.
        errors.push(format!("{operation}: {}", error.code()));
    }
}

fn transition_error(original: AppError, rollback_errors: Vec<String>) -> AppError {
    if rollback_errors.is_empty() {
        original
    } else {
        AppError::WindowTransition {
            original: Box::new(original),
            rollback: rollback_errors.join("; "),
        }
    }
}
