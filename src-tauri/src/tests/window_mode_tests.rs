use std::{future::Future, sync::Mutex, task::Poll};

use tokio::sync::Mutex as AsyncMutex;

use crate::{
    commands::windows::StickySettings,
    domain::errors::AppError,
    window_mode::{
        ProductWindow, WindowMode, WindowModeRuntime, reconcile_startup_mode, transition_to,
    },
};

struct ModeledState {
    main: bool,
    sticky: bool,
    settings: StickySettings,
    sticky_position: (i32, i32),
    operations: Vec<&'static str>,
}

struct FakeRuntime(Mutex<ModeledState>);

impl FakeRuntime {
    fn new(main: bool, sticky: bool, persisted_visible: bool) -> Self {
        Self(Mutex::new(ModeledState {
            main,
            sticky,
            settings: StickySettings {
                visible: persisted_visible,
                x: Some(10),
                y: Some(20),
                ..StickySettings::default()
            },
            sticky_position: (120, 240),
            operations: Vec::new(),
        }))
    }

    fn assert_mode(&self, target: WindowMode) {
        let state = self.0.lock().unwrap();
        let sticky = target == WindowMode::Sticky;
        assert_eq!((state.main, state.sticky), (!sticky, sticky));
        assert_eq!(state.settings.visible, sticky);
        assert_eq!(state.operations, expected_operations(target));
    }
}

// Expand the snapshot into its three reads so their order and completeness are checked too.
fn expected_operations(target: WindowMode) -> Vec<&'static str> {
    let mut operations = vec!["snapshot_main", "snapshot_sticky", "snapshot_settings"];
    operations.extend(match target {
        WindowMode::Sticky => vec![
            "configure_sticky",
            "show_sticky",
            "focus_sticky",
            "persist_visible_true",
            "hide_main",
        ],
        WindowMode::Main => vec![
            "show_main",
            "unminimize_main",
            "focus_main",
            "capture_sticky_position",
            "persist_visible_false",
            "hide_sticky",
        ],
    });
    operations
}

impl WindowModeRuntime for FakeRuntime {
    async fn read_settings(&self) -> Result<StickySettings, AppError> {
        let mut state = self.0.lock().unwrap();
        state.operations.push("snapshot_settings");
        Ok(state.settings.clone())
    }

    async fn write_settings(&self, settings: &StickySettings) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.operations.push(if settings.visible {
            "persist_visible_true"
        } else {
            "persist_visible_false"
        });
        state.settings = settings.clone();
        Ok(())
    }

    fn is_visible(&self, window: ProductWindow) -> Result<bool, AppError> {
        let mut state = self.0.lock().unwrap();
        Ok(match window {
            ProductWindow::Main => {
                state.operations.push("snapshot_main");
                state.main
            }
            ProductWindow::Sticky => {
                state.operations.push("snapshot_sticky");
                state.sticky
            }
        })
    }

    fn show(&self, window: ProductWindow) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        match window {
            ProductWindow::Main => {
                state.operations.push("show_main");
                state.main = true;
            }
            ProductWindow::Sticky => {
                state.operations.push("show_sticky");
                state.sticky = true;
            }
        }
        Ok(())
    }

    fn hide(&self, window: ProductWindow) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        match window {
            ProductWindow::Main => {
                state.operations.push("hide_main");
                state.main = false;
            }
            ProductWindow::Sticky => {
                state.operations.push("hide_sticky");
                state.sticky = false;
            }
        }
        Ok(())
    }

    fn focus(&self, window: ProductWindow) -> Result<(), AppError> {
        self.0.lock().unwrap().operations.push(match window {
            ProductWindow::Main => "focus_main",
            ProductWindow::Sticky => "focus_sticky",
        });
        Ok(())
    }

    fn unminimize(&self, window: ProductWindow) -> Result<(), AppError> {
        self.0.lock().unwrap().operations.push(match window {
            ProductWindow::Main => "unminimize_main",
            ProductWindow::Sticky => "unminimize_sticky",
        });
        Ok(())
    }

    fn configure_sticky(&self, settings: &StickySettings) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.operations.push("configure_sticky");
        if let (Some(x), Some(y)) = (settings.x, settings.y) {
            state.sticky_position = (x, y);
        }
        Ok(())
    }

    fn capture_sticky_position(&self, settings: &mut StickySettings) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.operations.push("capture_sticky_position");
        settings.x = Some(state.sticky_position.0);
        settings.y = Some(state.sticky_position.1);
        settings.monitor_name = Some("Modeled monitor".into());
        settings.scale_factor = Some(2.0);
        Ok(())
    }

    fn set_sticky_always_on_top(&self, _value: bool) -> Result<(), AppError> {
        self.0
            .lock()
            .unwrap()
            .operations
            .push("set_sticky_always_on_top");
        Ok(())
    }
}

#[tokio::test]
async fn entering_sticky_from_main_configures_persists_then_hides_main() {
    let runtime = FakeRuntime::new(true, false, false);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Sticky)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Sticky);
    assert_eq!(runtime.0.lock().unwrap().sticky_position, (10, 20));
}

#[tokio::test]
async fn entering_main_from_sticky_captures_position_before_persisting_and_hiding() {
    let runtime = FakeRuntime::new(false, true, true);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Main)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Main);
    let state = runtime.0.lock().unwrap();
    assert_eq!((state.settings.x, state.settings.y), (Some(120), Some(240)));
    assert_eq!(
        state.settings.monitor_name.as_deref(),
        Some("Modeled monitor")
    );
    assert_eq!(state.settings.scale_factor, Some(2.0));
}

#[tokio::test]
async fn reentering_sticky_keeps_exclusive_consistent_mode() {
    let runtime = FakeRuntime::new(false, true, true);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Sticky)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Sticky);
}

#[tokio::test]
async fn reentering_main_keeps_exclusive_consistent_mode() {
    let runtime = FakeRuntime::new(true, false, false);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Main)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Main);
}

#[tokio::test]
async fn startup_reconciles_persisted_sticky_mode() {
    let runtime = FakeRuntime::new(true, false, true);
    reconcile_startup_mode(&runtime, &AsyncMutex::new(()))
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Sticky);
}

#[tokio::test]
async fn startup_reconciles_persisted_main_mode() {
    let runtime = FakeRuntime::new(false, true, false);
    reconcile_startup_mode(&runtime, &AsyncMutex::new(()))
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Main);
}

#[tokio::test]
async fn zero_windows_can_enter_sticky_mode() {
    let runtime = FakeRuntime::new(false, false, false);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Sticky)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Sticky);
}

#[tokio::test]
async fn zero_windows_can_enter_main_mode() {
    let runtime = FakeRuntime::new(false, false, true);
    transition_to(&runtime, &AsyncMutex::new(()), WindowMode::Main)
        .await
        .unwrap();
    runtime.assert_mode(WindowMode::Main);
}

#[tokio::test]
async fn transition_waits_for_mutex_before_snapshot() {
    let runtime = FakeRuntime::new(true, false, false);
    let mutex = AsyncMutex::new(());
    let guard = mutex.lock().await;
    let mut transition = Box::pin(transition_to(&runtime, &mutex, WindowMode::Sticky));
    std::future::poll_fn(|cx| {
        assert!(transition.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    assert!(runtime.0.lock().unwrap().operations.is_empty());
    drop(guard);
    transition.await.unwrap();
    runtime.assert_mode(WindowMode::Sticky);
}

#[tokio::test]
async fn startup_waits_for_mutex_before_reading_persisted_mode() {
    let runtime = FakeRuntime::new(true, false, true);
    let mutex = AsyncMutex::new(());
    let guard = mutex.lock().await;
    let mut startup = Box::pin(reconcile_startup_mode(&runtime, &mutex));
    std::future::poll_fn(|cx| {
        assert!(startup.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    assert!(runtime.0.lock().unwrap().operations.is_empty());
    drop(guard);
    startup.await.unwrap();
    runtime.assert_mode(WindowMode::Sticky);
}
