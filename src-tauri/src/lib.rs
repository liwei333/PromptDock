pub mod commands;
pub mod db;
pub mod domain;
pub mod menu;
pub mod repositories;
pub mod services;
pub mod state;
pub mod window_mode;

use commands::{backup, categories, prompts, windows};
use db::Database;
use domain::errors::AppError;
use state::{AppState, current_shortcut_configuration};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use window_mode::{
    TauriWindowModeRuntime, WindowMode, hide_sticky_explicitly, persist_sticky_position,
    reconcile_startup_mode, toggle_product_mode, transition_to,
};

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativeWindowTask {
    EnterMain,
    RestorePersistedMode,
    ToggleMode,
    HideSticky,
    PersistStickyPosition,
}

fn native_window_task_for_dock_reopen() -> NativeWindowTask {
    NativeWindowTask::RestorePersistedMode
}

fn spawn_native_window_task(app: &AppHandle, operation: &'static str, task: NativeWindowTask) {
    let task_app = app.clone();
    // The single-instance listener can fire before setup. Queue state access behind the
    // main-thread setup hook, which completes startup reconciliation before returning.
    let scheduled = app.run_on_main_thread(move || {
        let state = match task_app.try_state::<AppState>() {
            Some(state) => state.inner().clone(),
            None => {
                let error = AppError::Native("窗口模式尚未准备好".to_string());
                eprintln!("{operation}: {}", error.code());
                return;
            }
        };
        let runtime = TauriWindowModeRuntime::new(task_app, state.clone());
        tauri::async_runtime::spawn(async move {
            let result = match task {
                NativeWindowTask::EnterMain => {
                    transition_to(&runtime, &state.mode_transition, WindowMode::Main).await
                }
                NativeWindowTask::RestorePersistedMode => {
                    reconcile_startup_mode(&runtime, &state.mode_transition).await
                }
                NativeWindowTask::ToggleMode => {
                    toggle_product_mode(&runtime, &state.mode_transition)
                        .await
                        .map(|_| ())
                }
                NativeWindowTask::HideSticky => {
                    hide_sticky_explicitly(&runtime, &state.mode_transition).await
                }
                NativeWindowTask::PersistStickyPosition => {
                    persist_sticky_position(&runtime, &state.mode_transition)
                        .await
                        .map(|_| ())
                }
            };
            if let Err(error) = result {
                // Fixed operation labels/codes deliberately exclude native messages and data.
                eprintln!("{operation}: {}", error.code());
            }
        });
    });
    if let Err(error) = scheduled.map_err(|_| AppError::Native("无法调度窗口操作".to_string()))
    {
        eprintln!("{operation}: {}", error.code());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            spawn_native_window_task(app, "single_instance", NativeWindowTask::EnterMain);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .menu(menu::build_menu)
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("promptdock.sqlite3");
            let database = tauri::async_runtime::block_on(Database::connect_path(&database_path))?;
            app.manage(AppState::new(database, database_path));
            let state = app.state::<AppState>().inner().clone();
            let runtime = TauriWindowModeRuntime::new(app.handle().clone(), state.clone());
            tauri::async_runtime::block_on(reconcile_startup_mode(
                &runtime,
                &state.mode_transition,
            ))?;

            app.on_menu_event(|app, event| match event.id().as_ref() {
                "open-main" => {
                    spawn_native_window_task(app, "menu_open_main", NativeWindowTask::EnterMain);
                }
                "toggle-sticky" => {
                    spawn_native_window_task(
                        app,
                        "menu_toggle_sticky",
                        NativeWindowTask::ToggleMode,
                    );
                }
                "quit" => app.exit(0),
                _ => {}
            });

            let shortcut_result = app.global_shortcut().on_shortcut(
                current_shortcut_configuration().0,
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = windows::reveal_quick_window(app, None);
                    }
                },
            );
            if let Ok(mut status) = app.state::<AppState>().shortcut.write() {
                match shortcut_result {
                    Ok(()) => status.registered = true,
                    Err(error) => status.error = Some(error.to_string()),
                }
            }

            if let Some(sticky) = app.get_webview_window("sticky") {
                #[cfg(target_os = "macos")]
                {
                    let native_window = sticky.ns_window()?;
                    let native_window: &objc2_app_kit::NSWindow = unsafe { &*native_window.cast() };
                    native_window.setMovableByWindowBackground(true);
                }
                let app_for_events = app.handle().clone();
                sticky.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        spawn_native_window_task(
                            &app_for_events,
                            "sticky_close",
                            NativeWindowTask::HideSticky,
                        );
                    } else if matches!(event, WindowEvent::Moved(_)) {
                        spawn_native_window_task(
                            &app_for_events,
                            "sticky_moved",
                            NativeWindowTask::PersistStickyPosition,
                        );
                    }
                });
            }
            if let Some(quick) = app.get_webview_window("quick") {
                let quick_for_events = quick.clone();
                quick.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = quick_for_events.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prompts::list_prompts,
            prompts::get_prompt,
            prompts::create_prompt,
            prompts::update_prompt,
            prompts::delete_prompt,
            prompts::set_favorite,
            prompts::set_pinned,
            prompts::record_successful_copy,
            prompts::list_sticky_prompts,
            prompts::reorder_sticky_prompts,
            prompts::get_dashboard_stats,
            prompts::list_prompt_tags,
            categories::list_categories,
            categories::create_category,
            categories::rename_category,
            categories::delete_category,
            backup::export_backup,
            backup::preview_import_backup,
            backup::commit_import_backup,
            backup::cancel_import_backup,
            windows::show_quick_window,
            windows::hide_quick_window,
            windows::enter_sticky_mode,
            windows::enter_main_mode,
            windows::hide_sticky_window,
            windows::get_sticky_settings,
            windows::set_sticky_settings,
            windows::get_runtime_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building PromptDock");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if matches!(_event, tauri::RunEvent::Reopen { .. }) {
            spawn_native_window_task(_app, "dock_reopen", native_window_task_for_dock_reopen());
        }
    });
}
