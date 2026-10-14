use std::future::Future;

use serde::Serialize;
use tokio::sync::Mutex;

use crate::{commands::windows::StickySettings, domain::errors::AppError};

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

pub(crate) async fn transition_to(
    runtime: &impl WindowModeRuntime,
    mutex: &Mutex<()>,
    target: WindowMode,
) -> Result<(), AppError> {
    let _guard = mutex.lock().await;
    let snapshot = snapshot_mode(runtime).await?;
    transition_from_snapshot(runtime, snapshot, target).await
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
    let mut settings = snapshot.settings;
    match target {
        WindowMode::Sticky => {
            runtime.configure_sticky(&settings)?;
            runtime.show(ProductWindow::Sticky)?;
            runtime.focus(ProductWindow::Sticky)?;
            settings.visible = true;
            runtime.write_settings(&settings).await?;
            runtime.hide(ProductWindow::Main)?;
        }
        WindowMode::Main => {
            runtime.show(ProductWindow::Main)?;
            runtime.unminimize(ProductWindow::Main)?;
            runtime.focus(ProductWindow::Main)?;
            runtime.capture_sticky_position(&mut settings)?;
            settings.visible = false;
            runtime.write_settings(&settings).await?;
            runtime.hide(ProductWindow::Sticky)?;
        }
    }
    Ok(())
}
