use crate::{NativeWindowTask, native_window_task_for_dock_reopen};

#[test]
fn dock_reopen_restores_the_persisted_window_mode() {
    assert_eq!(
        native_window_task_for_dock_reopen(),
        NativeWindowTask::RestorePersistedMode
    );
}
