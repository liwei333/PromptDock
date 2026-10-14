use std::{
    collections::VecDeque,
    future::Future,
    sync::{Arc, Mutex},
    task::Poll,
};

use tokio::sync::{Mutex as AsyncMutex, Notify};

use crate::{
    commands::windows::StickySettings,
    domain::errors::{AppError, ErrorPayload},
    window_mode::{
        ProductWindow, WindowMode, WindowModeRuntime, hide_sticky_explicitly,
        persist_sticky_position, reconcile_startup_mode, set_sticky_always_on_top,
        toggle_product_mode, transition_to,
    },
};

struct ModeledState {
    main: bool,
    sticky: bool,
    settings: StickySettings,
    sticky_position: (i32, i32),
    sticky_monitor: (&'static str, f64),
    native_always_on_top: bool,
    operations: Vec<&'static str>,
    failures: VecDeque<InjectedFailure>,
    write_gate: Option<Arc<WriteGate>>,
    corrupt_captured_preferences: bool,
}

struct FakeRuntime(Mutex<ModeledState>);

#[derive(Clone, Copy, PartialEq, Eq)]
enum FailureTiming {
    Before,
    After,
}

struct InjectedFailure {
    operation: &'static str,
    timing: FailureTiming,
    error: AppError,
}

#[derive(Default)]
struct WriteGate {
    entered: Notify,
    release: Notify,
}

impl WriteGate {
    async fn assert_entered(&self) {
        let mut entered = Box::pin(self.entered.notified());
        std::future::poll_fn(|cx| {
            assert!(
                entered.as_mut().poll(cx).is_ready(),
                "the paused operation must have reached persistence"
            );
            Poll::Ready(())
        })
        .await;
    }
}

impl ModeledState {
    fn fail_at(&mut self, operation: &'static str, timing: FailureTiming) -> Result<(), AppError> {
        if self
            .failures
            .front()
            .is_some_and(|failure| failure.operation == operation && failure.timing == timing)
        {
            return Err(self.failures.pop_front().unwrap().error);
        }
        Ok(())
    }

    fn begin(&mut self, operation: &'static str) -> Result<(), AppError> {
        self.operations.push(operation);
        self.fail_at(operation, FailureTiming::Before)
    }

    fn finish(&mut self, operation: &'static str) -> Result<(), AppError> {
        self.fail_at(operation, FailureTiming::After)
    }
}

impl FakeRuntime {
    fn new(main: bool, sticky: bool, persisted_visible: bool) -> Self {
        Self(Mutex::new(ModeledState {
            main,
            sticky,
            settings: StickySettings {
                visible: persisted_visible,
                x: Some(10),
                y: Some(20),
                monitor_name: Some("Original monitor".into()),
                scale_factor: Some(1.0),
                ..StickySettings::default()
            },
            sticky_position: (120, 240),
            sticky_monitor: ("Modeled monitor", 2.0),
            native_always_on_top: true,
            operations: Vec::new(),
            failures: VecDeque::new(),
            write_gate: None,
            corrupt_captured_preferences: false,
        }))
    }

    fn fail(&self, operation: &'static str, timing: FailureTiming, error: AppError) {
        self.0.lock().unwrap().failures.push_back(InjectedFailure {
            operation,
            timing,
            error,
        });
    }

    fn pause_next_write(&self) -> Arc<WriteGate> {
        let gate = Arc::new(WriteGate::default());
        self.0.lock().unwrap().write_gate = Some(gate.clone());
        gate
    }

    fn snapshot(&self) -> (bool, bool, serde_json::Value) {
        let state = self.0.lock().unwrap();
        (
            state.main,
            state.sticky,
            serde_json::to_value(&state.settings).unwrap(),
        )
    }

    fn assert_exclusive_mode(&self, target: WindowMode) {
        let state = self.0.lock().unwrap();
        let sticky = target == WindowMode::Sticky;
        assert_eq!((state.main, state.sticky), (!sticky, sticky));
        assert_eq!(state.settings.visible, sticky);
    }

    fn assert_mode(&self, target: WindowMode) {
        self.assert_exclusive_mode(target);
        let state = self.0.lock().unwrap();
        assert_eq!(state.operations, expected_operations(target));
    }

    fn assert_startup_mode(&self, target: WindowMode) {
        self.assert_exclusive_mode(target);
        let mut expected = expected_operations(target);
        if target == WindowMode::Main {
            expected.insert(3, "configure_sticky");
        }
        assert_eq!(self.0.lock().unwrap().operations, expected);
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
        state.begin("snapshot_settings")?;
        state.finish("snapshot_settings")?;
        Ok(state.settings.clone())
    }

    async fn write_settings(&self, settings: &StickySettings) -> Result<(), AppError> {
        let operation = if settings.visible {
            "persist_visible_true"
        } else {
            "persist_visible_false"
        };
        let gate = {
            let mut state = self.0.lock().unwrap();
            state.begin(operation)?;
            state.write_gate.take()
        };
        if let Some(gate) = gate {
            gate.entered.notify_one();
            gate.release.notified().await;
        }
        let mut state = self.0.lock().unwrap();
        state.settings = settings.clone();
        state.finish(operation)
    }

    fn is_visible(&self, window: ProductWindow) -> Result<bool, AppError> {
        let mut state = self.0.lock().unwrap();
        Ok(match window {
            ProductWindow::Main => {
                state.begin("snapshot_main")?;
                state.main
            }
            ProductWindow::Sticky => {
                state.begin("snapshot_sticky")?;
                state.sticky
            }
        })
    }

    fn show(&self, window: ProductWindow) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        let operation = match window {
            ProductWindow::Main => {
                state.begin("show_main")?;
                state.main = true;
                "show_main"
            }
            ProductWindow::Sticky => {
                state.begin("show_sticky")?;
                state.sticky = true;
                "show_sticky"
            }
        };
        state.finish(operation)
    }

    fn hide(&self, window: ProductWindow) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        let operation = match window {
            ProductWindow::Main => {
                state.begin("hide_main")?;
                state.main = false;
                "hide_main"
            }
            ProductWindow::Sticky => {
                state.begin("hide_sticky")?;
                state.sticky = false;
                "hide_sticky"
            }
        };
        state.finish(operation)
    }

    fn focus(&self, window: ProductWindow) -> Result<(), AppError> {
        let operation = match window {
            ProductWindow::Main => "focus_main",
            ProductWindow::Sticky => "focus_sticky",
        };
        let mut state = self.0.lock().unwrap();
        state.begin(operation)?;
        state.finish(operation)
    }

    fn unminimize(&self, window: ProductWindow) -> Result<(), AppError> {
        let operation = match window {
            ProductWindow::Main => "unminimize_main",
            ProductWindow::Sticky => "unminimize_sticky",
        };
        let mut state = self.0.lock().unwrap();
        state.begin(operation)?;
        state.finish(operation)
    }

    fn configure_sticky(&self, settings: &StickySettings) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.begin("configure_sticky")?;
        if let (Some(x), Some(y)) = (settings.x, settings.y) {
            state.sticky_position = (x, y);
            // Restoring onto a saved display changes the native monitor and its scale.
            if let Some(monitor) = [("Original monitor", 1.0), ("Modeled monitor", 2.0)]
                .into_iter()
                .find(|(name, _)| Some(*name) == settings.monitor_name.as_deref())
            {
                state.sticky_monitor = monitor;
            }
        }
        state.native_always_on_top = settings.always_on_top;
        state.finish("configure_sticky")
    }

    fn capture_sticky_position(&self, settings: &mut StickySettings) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.begin("capture_sticky_position")?;
        settings.x = Some(state.sticky_position.0);
        settings.y = Some(state.sticky_position.1);
        settings.monitor_name = Some(state.sticky_monitor.0.into());
        settings.scale_factor = Some(state.sticky_monitor.1);
        if state.corrupt_captured_preferences {
            settings.visible = !settings.visible;
            settings.always_on_top = !settings.always_on_top;
        }
        state.finish("capture_sticky_position")
    }

    fn set_sticky_always_on_top(&self, value: bool) -> Result<(), AppError> {
        let mut state = self.0.lock().unwrap();
        state.begin("set_sticky_always_on_top")?;
        state.native_always_on_top = value;
        state.finish("set_sticky_always_on_top")
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
    runtime.assert_startup_mode(WindowMode::Sticky);
}

#[tokio::test]
async fn startup_reconciles_persisted_main_mode() {
    let runtime = FakeRuntime::new(false, true, false);
    reconcile_startup_mode(&runtime, &AsyncMutex::new(()))
        .await
        .unwrap();
    runtime.assert_startup_mode(WindowMode::Main);
}

#[tokio::test]
async fn startup_main_restores_saved_sticky_position_before_capture() {
    let runtime = FakeRuntime::new(true, false, false);
    let saved = runtime.snapshot().2;

    reconcile_startup_mode(&runtime, &AsyncMutex::new(()))
        .await
        .unwrap();

    assert_eq!(runtime.snapshot().2, saved);
    runtime.assert_startup_mode(WindowMode::Main);
    let state = runtime.0.lock().unwrap();
    assert_eq!(state.sticky_position, (10, 20));
    assert_eq!(state.sticky_monitor, ("Original monitor", 1.0));
}

#[tokio::test]
async fn startup_main_restore_failure_does_not_capture_or_persist_fresh_position() {
    for timing in [FailureTiming::Before, FailureTiming::After] {
        let runtime = FakeRuntime::new(true, false, false);
        let snapshot = runtime.snapshot();
        runtime.fail("configure_sticky", timing, native_failure());

        let error = reconcile_startup_mode(&runtime, &AsyncMutex::new(()))
            .await
            .unwrap_err();

        assert_eq!(error.code(), "NATIVE_ERROR");
        assert_eq!(runtime.snapshot(), snapshot);
        let state = runtime.0.lock().unwrap();
        assert_eq!(
            state.operations,
            [
                "snapshot_main",
                "snapshot_sticky",
                "snapshot_settings",
                "configure_sticky",
            ]
        );
        assert!(state.failures.is_empty());
    }
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
    for target in [WindowMode::Main, WindowMode::Sticky] {
        let runtime = FakeRuntime::new(true, false, target == WindowMode::Sticky);
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
        runtime.assert_startup_mode(target);
    }
}

fn native_failure() -> AppError {
    AppError::Native("injected primary failure".into())
}

fn primary_failure(operation: &str) -> AppError {
    if operation.starts_with("persist_") {
        AppError::Database(sqlx::Error::PoolClosed)
    } else {
        native_failure()
    }
}

async fn assert_pending<F: Future>(mut future: std::pin::Pin<&mut F>) {
    std::future::poll_fn(|cx| {
        assert!(future.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
}

async fn assert_transition_compensates(target: WindowMode, operation: &'static str) {
    for zero_windows in [false, true] {
        for timing in [FailureTiming::Before, FailureTiming::After] {
            let from_sticky = target == WindowMode::Main;
            let runtime = FakeRuntime::new(
                !zero_windows && !from_sticky,
                !zero_windows && from_sticky,
                !zero_windows && from_sticky,
            );
            let snapshot = runtime.snapshot();
            let original = primary_failure(operation);
            let original_code = original.code();
            let original_message = original.to_string();
            runtime.fail(operation, timing, original);

            let error = transition_to(&runtime, &AsyncMutex::new(()), target)
                .await
                .expect_err(operation);

            assert_eq!(error.code(), original_code);
            assert_eq!(error.to_string(), original_message);
            assert_eq!(
                runtime.snapshot(),
                snapshot,
                "failed at {operation}, zero windows: {zero_windows}"
            );
            let state = runtime.0.lock().unwrap();
            if !zero_windows {
                assert_eq!(state.settings.visible, state.sticky);
            }
            let visibility_restores = [
                if snapshot.0 { "show_main" } else { "hide_main" },
                if snapshot.1 {
                    "show_sticky"
                } else {
                    "hide_sticky"
                },
            ];
            assert!(
                state.operations.ends_with(&visibility_restores),
                "both visibility restores must be attempted: {:?}",
                state.operations
            );
            let persisted = operation.starts_with("persist_") || operation.starts_with("hide_");
            let writes = state
                .operations
                .iter()
                .filter(|op| op.starts_with("persist_"))
                .count();
            assert_eq!(
                writes,
                if persisted { 2 } else { 0 },
                "restore settings only after a persistence attempt"
            );
            assert!(state.failures.is_empty());
        }
    }
}

macro_rules! transition_failure_cases {
    ($(($name:ident, $target:ident, $operation:literal)),+ $(,)?) => {
        $(
            #[tokio::test]
            async fn $name() {
                assert_transition_compensates(WindowMode::$target, $operation).await;
            }
        )+
    };
}

transition_failure_cases!(
    (
        sticky_configure_failure_restores_snapshot,
        Sticky,
        "configure_sticky"
    ),
    (sticky_show_failure_restores_snapshot, Sticky, "show_sticky"),
    (
        sticky_focus_failure_restores_snapshot,
        Sticky,
        "focus_sticky"
    ),
    (
        sticky_persist_failure_restores_snapshot,
        Sticky,
        "persist_visible_true"
    ),
    (
        sticky_source_hide_failure_restores_snapshot,
        Sticky,
        "hide_main"
    ),
    (main_show_failure_restores_snapshot, Main, "show_main"),
    (
        main_unminimize_failure_restores_snapshot,
        Main,
        "unminimize_main"
    ),
    (main_focus_failure_restores_snapshot, Main, "focus_main"),
    (
        main_capture_failure_restores_snapshot,
        Main,
        "capture_sticky_position"
    ),
    (
        main_persist_failure_restores_snapshot,
        Main,
        "persist_visible_false"
    ),
    (
        main_source_hide_failure_restores_snapshot,
        Main,
        "hide_sticky"
    ),
);

#[tokio::test]
async fn compensation_reports_all_failures_without_changing_primary_error_code() {
    for target in [WindowMode::Sticky, WindowMode::Main] {
        for persistence_failure in [false, true] {
            let from_sticky = target == WindowMode::Main;
            let runtime = FakeRuntime::new(!from_sticky, from_sticky, from_sticky);
            let snapshot_json = runtime.snapshot().2.to_string();
            let primary_operation = match (target, persistence_failure) {
                (WindowMode::Sticky, true) => "persist_visible_true",
                (WindowMode::Sticky, false) => "hide_main",
                (WindowMode::Main, true) => "persist_visible_false",
                (WindowMode::Main, false) => "hide_sticky",
            };
            let original = primary_failure(primary_operation);
            let primary_code = original.code();
            runtime.fail(primary_operation, FailureTiming::After, original);
            let restore_operations = if from_sticky {
                ["persist_visible_true", "hide_main", "show_sticky"]
            } else {
                ["persist_visible_false", "show_main", "hide_sticky"]
            };
            for operation in restore_operations {
                runtime.fail(
                    operation,
                    FailureTiming::Before,
                    AppError::Native(format!("PRIVATE_PROMPT_TEXT {snapshot_json}")),
                );
            }

            let error = transition_to(&runtime, &AsyncMutex::new(()), target)
                .await
                .unwrap_err();

            assert_eq!(error.code(), primary_code);
            let payload = ErrorPayload::from(error);
            assert_eq!(payload.code, primary_code);
            assert!(payload.message.contains("回滚失败"));
            for label in [
                "restore_settings",
                "restore_main_visibility",
                "restore_sticky_visibility",
            ] {
                assert!(
                    payload.message.contains(label),
                    "missing rollback operation {label}: {}",
                    payload.message
                );
            }
            assert_eq!(payload.message.matches("NATIVE_ERROR").count(), 3);
            assert!(!payload.message.contains("PRIVATE_PROMPT_TEXT"));
            assert!(!payload.message.contains(&snapshot_json));
            assert!(!payload.message.contains("alwaysOnTop"));
            assert!(
                runtime.0.lock().unwrap().failures.is_empty(),
                "compensation must not short circuit"
            );
        }
    }
}

#[tokio::test]
async fn opposing_transitions_serialize_through_persistence() {
    for first_target in [WindowMode::Sticky, WindowMode::Main] {
        let second_target = if first_target == WindowMode::Sticky {
            WindowMode::Main
        } else {
            WindowMode::Sticky
        };
        let from_sticky = first_target == WindowMode::Main;
        let runtime = FakeRuntime::new(!from_sticky, from_sticky, from_sticky);
        let mutex = AsyncMutex::new(());
        let gate = runtime.pause_next_write();
        let mut first = Box::pin(transition_to(&runtime, &mutex, first_target));
        assert_pending(first.as_mut()).await;
        gate.assert_entered().await;
        let first_operations = runtime.0.lock().unwrap().operations.clone();

        let mut second = Box::pin(transition_to(&runtime, &mutex, second_target));
        assert_pending(second.as_mut()).await;
        assert_eq!(runtime.0.lock().unwrap().operations, first_operations);

        gate.release.notify_one();
        first.await.unwrap();
        runtime.assert_exclusive_mode(first_target);
        second.await.unwrap();
        runtime.assert_exclusive_mode(second_target);
        let mut expected = expected_operations(first_target);
        expected.extend(expected_operations(second_target));
        assert_eq!(runtime.0.lock().unwrap().operations, expected);
    }
}

#[tokio::test]
async fn explicit_close_captures_persists_and_hides_without_changing_main() {
    for main in [false, true] {
        let runtime = FakeRuntime::new(main, true, true);
        let mut expected = runtime.snapshot().2;
        expected["visible"] = false.into();
        expected["x"] = 120.into();
        expected["y"] = 240.into();
        expected["monitorName"] = "Modeled monitor".into();
        expected["scaleFactor"] = 2.0.into();

        hide_sticky_explicitly(&runtime, &AsyncMutex::new(()))
            .await
            .unwrap();

        assert_eq!(runtime.snapshot(), (main, false, expected));
        assert_eq!(
            runtime.0.lock().unwrap().operations,
            [
                "snapshot_main",
                "snapshot_sticky",
                "snapshot_settings",
                "capture_sticky_position",
                "persist_visible_false",
                "hide_sticky",
            ]
        );
    }
}

async fn assert_explicit_close_compensates(operation: &'static str) {
    for main in [false, true] {
        for timing in [FailureTiming::Before, FailureTiming::After] {
            let runtime = FakeRuntime::new(main, true, true);
            let snapshot = runtime.snapshot();
            let original = primary_failure(operation);
            let original_code = original.code();
            runtime.fail(operation, timing, original);

            let error = hide_sticky_explicitly(&runtime, &AsyncMutex::new(()))
                .await
                .unwrap_err();

            assert_eq!(error.code(), original_code);
            assert_eq!(runtime.snapshot(), snapshot);
            let state = runtime.0.lock().unwrap();
            assert!(
                state
                    .operations
                    .ends_with(&[if main { "show_main" } else { "hide_main" }, "show_sticky",])
            );
            assert!(state.failures.is_empty());
        }
    }
}

#[tokio::test]
async fn explicit_close_capture_failure_restores_snapshot() {
    assert_explicit_close_compensates("capture_sticky_position").await;
}

#[tokio::test]
async fn explicit_close_persist_failure_restores_snapshot() {
    assert_explicit_close_compensates("persist_visible_false").await;
}

#[tokio::test]
async fn explicit_close_hide_failure_restores_snapshot() {
    assert_explicit_close_compensates("hide_sticky").await;
}

#[tokio::test]
async fn explicit_close_rollback_failure_preserves_database_code_and_sanitizes_detail() {
    let runtime = FakeRuntime::new(false, true, true);
    let snapshot_json = runtime.snapshot().2.to_string();
    runtime.fail(
        "persist_visible_false",
        FailureTiming::After,
        AppError::Database(sqlx::Error::PoolClosed),
    );
    runtime.fail(
        "persist_visible_true",
        FailureTiming::Before,
        AppError::Native(format!("PRIVATE_PROMPT_TEXT {snapshot_json}")),
    );
    runtime.fail("hide_main", FailureTiming::Before, native_failure());

    let error = hide_sticky_explicitly(&runtime, &AsyncMutex::new(()))
        .await
        .unwrap_err();

    assert_eq!(error.code(), "DATABASE_ERROR");
    let payload = ErrorPayload::from(error);
    assert_eq!(payload.code, "DATABASE_ERROR");
    assert!(payload.message.contains("restore_settings: NATIVE_ERROR"));
    assert!(
        payload
            .message
            .contains("restore_main_visibility: NATIVE_ERROR")
    );
    assert!(!payload.message.contains("PRIVATE_PROMPT_TEXT"));
    assert!(!payload.message.contains(&snapshot_json));
    let state = runtime.0.lock().unwrap();
    assert!(!state.main);
    assert!(state.sticky);
    assert_eq!(state.operations.last(), Some(&"show_sticky"));
    assert!(state.failures.is_empty());
}

#[tokio::test]
async fn explicit_close_waits_for_an_in_progress_transition() {
    let runtime = FakeRuntime::new(true, false, false);
    let mutex = AsyncMutex::new(());
    let gate = runtime.pause_next_write();
    let mut transition = Box::pin(transition_to(&runtime, &mutex, WindowMode::Sticky));
    assert_pending(transition.as_mut()).await;
    gate.assert_entered().await;
    let first_operations = runtime.0.lock().unwrap().operations.clone();
    let mut close = Box::pin(hide_sticky_explicitly(&runtime, &mutex));
    assert_pending(close.as_mut()).await;
    assert_eq!(runtime.0.lock().unwrap().operations, first_operations);

    gate.release.notify_one();
    transition.await.unwrap();
    close.await.unwrap();

    let state = runtime.0.lock().unwrap();
    assert_eq!(
        (state.main, state.sticky, state.settings.visible),
        (false, false, false)
    );
}

#[tokio::test]
async fn position_persistence_reads_latest_settings_under_lock_and_only_changes_position() {
    let runtime = FakeRuntime::new(true, false, false);
    let mutex = AsyncMutex::new(());
    let guard = mutex.lock().await;
    let mut moved = Box::pin(persist_sticky_position(&runtime, &mutex));
    assert_pending(moved.as_mut()).await;
    assert!(runtime.0.lock().unwrap().operations.is_empty());
    {
        // Model an earlier lock holder completing a mode/preference update.
        let mut state = runtime.0.lock().unwrap();
        state.main = false;
        state.sticky = true;
        state.settings.visible = true;
        state.settings.always_on_top = false;
        state.corrupt_captured_preferences = true;
    }
    drop(guard);

    let settings = moved.await.unwrap();

    let expected = serde_json::json!({
        "visible": true, "alwaysOnTop": false, "x": 120, "y": 240,
        "monitorName": "Modeled monitor", "scaleFactor": 2.0,
    });
    assert_eq!(serde_json::to_value(&settings).unwrap(), expected);
    assert_eq!(runtime.snapshot(), (false, true, expected));
    assert_eq!(
        runtime.0.lock().unwrap().operations,
        [
            "snapshot_settings",
            "capture_sticky_position",
            "persist_visible_true",
        ]
    );
}

#[tokio::test]
async fn position_persistence_serializes_with_each_mode_transition() {
    for target in [WindowMode::Sticky, WindowMode::Main] {
        let from_sticky = target == WindowMode::Main;
        let runtime = FakeRuntime::new(!from_sticky, from_sticky, from_sticky);
        let mutex = AsyncMutex::new(());
        let gate = runtime.pause_next_write();
        let mut transition = Box::pin(transition_to(&runtime, &mutex, target));
        assert_pending(transition.as_mut()).await;
        gate.assert_entered().await;
        let first_operations = runtime.0.lock().unwrap().operations.clone();
        let mut moved = Box::pin(persist_sticky_position(&runtime, &mutex));
        assert_pending(moved.as_mut()).await;
        assert_eq!(runtime.0.lock().unwrap().operations, first_operations);

        gate.release.notify_one();
        transition.await.unwrap();
        let settings = moved.await.unwrap();

        runtime.assert_exclusive_mode(target);
        assert_eq!(settings.visible, target == WindowMode::Sticky);
        assert!(settings.always_on_top);
    }
}

#[tokio::test]
async fn failed_position_persistence_restores_prior_settings_without_native_mutations() {
    for operation in ["capture_sticky_position", "persist_visible_true"] {
        for timing in [FailureTiming::Before, FailureTiming::After] {
            let runtime = FakeRuntime::new(false, true, true);
            let snapshot = runtime.snapshot();
            let original = primary_failure(operation);
            let original_code = original.code();
            runtime.fail(operation, timing, original);

            let error = persist_sticky_position(&runtime, &AsyncMutex::new(()))
                .await
                .unwrap_err();

            assert_eq!(error.code(), original_code);
            assert_eq!(runtime.snapshot(), snapshot);
            let state = runtime.0.lock().unwrap();
            assert!(state.operations.iter().all(|op| matches!(
                *op,
                "snapshot_settings" | "capture_sticky_position" | "persist_visible_true"
            )));
            assert!(state.failures.is_empty());
        }
    }
}

#[tokio::test]
async fn top_preference_reads_latest_settings_under_lock_and_changes_only_top() {
    let runtime = FakeRuntime::new(true, false, false);
    let mutex = AsyncMutex::new(());
    let guard = mutex.lock().await;
    let mut setter = Box::pin(set_sticky_always_on_top(&runtime, &mutex, false));
    assert_pending(setter.as_mut()).await;
    assert!(runtime.0.lock().unwrap().operations.is_empty());
    let mut expected = {
        let mut state = runtime.0.lock().unwrap();
        state.main = false;
        state.sticky = true;
        state.settings.visible = true;
        state.settings.x = Some(999);
        state.settings.y = None;
        state.settings.monitor_name = Some("Latest monitor".into());
        state.settings.scale_factor = Some(1.25);
        serde_json::to_value(&state.settings).unwrap()
    };
    expected["alwaysOnTop"] = false.into();
    drop(guard);

    let settings = setter.await.unwrap();

    assert_eq!(serde_json::to_value(&settings).unwrap(), expected);
    assert_eq!(runtime.snapshot(), (false, true, expected));
    let state = runtime.0.lock().unwrap();
    assert!(!state.native_always_on_top);
    assert_eq!(state.sticky_position, (120, 240));
    assert_eq!(
        state.operations,
        [
            "snapshot_settings",
            "set_sticky_always_on_top",
            "persist_visible_true"
        ]
    );
}

#[tokio::test]
async fn top_preference_queued_behind_each_transition_retains_selected_mode() {
    for target in [WindowMode::Sticky, WindowMode::Main] {
        let from_sticky = target == WindowMode::Main;
        let runtime = FakeRuntime::new(!from_sticky, from_sticky, from_sticky);
        let mutex = AsyncMutex::new(());
        let gate = runtime.pause_next_write();
        let mut transition = Box::pin(transition_to(&runtime, &mutex, target));
        assert_pending(transition.as_mut()).await;
        gate.assert_entered().await;
        let first_operations = runtime.0.lock().unwrap().operations.clone();
        let mut setter = Box::pin(set_sticky_always_on_top(&runtime, &mutex, false));
        assert_pending(setter.as_mut()).await;
        assert_eq!(runtime.0.lock().unwrap().operations, first_operations);

        gate.release.notify_one();
        transition.await.unwrap();
        setter.await.unwrap();

        runtime.assert_exclusive_mode(target);
        let state = runtime.0.lock().unwrap();
        assert!(!state.settings.always_on_top);
        assert!(!state.native_always_on_top);
    }
}

#[tokio::test]
async fn top_preference_holds_lock_through_native_apply_and_persistence() {
    for target in [WindowMode::Sticky, WindowMode::Main] {
        let from_sticky = target == WindowMode::Main;
        let runtime = FakeRuntime::new(!from_sticky, from_sticky, from_sticky);
        let mutex = AsyncMutex::new(());
        let gate = runtime.pause_next_write();
        let mut setter = Box::pin(set_sticky_always_on_top(&runtime, &mutex, false));
        assert_pending(setter.as_mut()).await;
        gate.assert_entered().await;
        let first_operations = runtime.0.lock().unwrap().operations.clone();
        assert!(!runtime.0.lock().unwrap().native_always_on_top);
        let mut transition = Box::pin(transition_to(&runtime, &mutex, target));
        assert_pending(transition.as_mut()).await;
        assert_eq!(runtime.0.lock().unwrap().operations, first_operations);

        gate.release.notify_one();
        setter.await.unwrap();
        transition.await.unwrap();

        runtime.assert_exclusive_mode(target);
        let state = runtime.0.lock().unwrap();
        assert!(!state.settings.always_on_top);
        assert!(!state.native_always_on_top);
    }
}

#[tokio::test]
async fn top_preference_apply_or_persist_failure_restores_settings_and_native_preference() {
    for sticky in [false, true] {
        let persist_operation = if sticky {
            "persist_visible_true"
        } else {
            "persist_visible_false"
        };
        for operation in ["set_sticky_always_on_top", persist_operation] {
            for timing in [FailureTiming::Before, FailureTiming::After] {
                let runtime = FakeRuntime::new(!sticky, sticky, sticky);
                let snapshot = runtime.snapshot();
                let original = primary_failure(operation);
                let original_code = original.code();
                runtime.fail(operation, timing, original);

                let error = set_sticky_always_on_top(&runtime, &AsyncMutex::new(()), false)
                    .await
                    .unwrap_err();

                assert_eq!(error.code(), original_code);
                assert_eq!(runtime.snapshot(), snapshot);
                let state = runtime.0.lock().unwrap();
                assert!(state.native_always_on_top);
                assert_eq!(state.sticky_position, (120, 240));
                assert!(state.operations.iter().all(|op| matches!(
                    *op,
                    "snapshot_settings"
                        | "set_sticky_always_on_top"
                        | "persist_visible_true"
                        | "persist_visible_false"
                )));
                assert!(state.failures.is_empty());
            }
        }
    }
}

#[tokio::test]
async fn top_preference_rollback_failure_keeps_primary_code_and_sanitizes_detail() {
    let runtime = FakeRuntime::new(false, true, true);
    let snapshot_json = runtime.snapshot().2.to_string();
    runtime.fail(
        "persist_visible_true",
        FailureTiming::After,
        AppError::Database(sqlx::Error::PoolClosed),
    );
    runtime.fail(
        "persist_visible_true",
        FailureTiming::Before,
        native_failure(),
    );
    runtime.fail(
        "set_sticky_always_on_top",
        FailureTiming::Before,
        AppError::Native(format!("PRIVATE_PROMPT_TEXT {snapshot_json}")),
    );

    let error = set_sticky_always_on_top(&runtime, &AsyncMutex::new(()), false)
        .await
        .unwrap_err();

    assert_eq!(error.code(), "DATABASE_ERROR");
    let payload = ErrorPayload::from(error);
    assert_eq!(payload.code, "DATABASE_ERROR");
    assert!(payload.message.contains("restore_settings: NATIVE_ERROR"));
    assert!(
        payload
            .message
            .contains("restore_always_on_top: NATIVE_ERROR")
    );
    assert!(!payload.message.contains("PRIVATE_PROMPT_TEXT"));
    assert!(!payload.message.contains(&snapshot_json));
    runtime.assert_exclusive_mode(WindowMode::Sticky);
    assert!(runtime.0.lock().unwrap().failures.is_empty());
}

#[tokio::test]
async fn two_menu_toggles_choose_their_targets_after_acquiring_the_lock() {
    let runtime = FakeRuntime::new(true, false, false);
    let mutex = AsyncMutex::new(());
    let gate = runtime.pause_next_write();
    let mut first = Box::pin(toggle_product_mode(&runtime, &mutex));
    assert_pending(first.as_mut()).await;
    gate.assert_entered().await;
    let first_operations = runtime.0.lock().unwrap().operations.clone();
    let mut second = Box::pin(toggle_product_mode(&runtime, &mutex));
    assert_pending(second.as_mut()).await;
    assert_eq!(
        runtime.0.lock().unwrap().operations,
        first_operations,
        "a queued toggle must not inspect visibility before owning the lock"
    );

    gate.release.notify_one();
    assert_eq!(first.await.unwrap(), WindowMode::Sticky);
    runtime.assert_exclusive_mode(WindowMode::Sticky);
    assert_eq!(second.await.unwrap(), WindowMode::Main);
    runtime.assert_exclusive_mode(WindowMode::Main);
    let mut expected = expected_operations(WindowMode::Sticky);
    expected.extend(expected_operations(WindowMode::Main));
    assert_eq!(runtime.0.lock().unwrap().operations, expected);
}
