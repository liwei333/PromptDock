pub mod commands;
pub mod db;
pub mod domain;
pub mod menu;
pub mod repositories;
pub mod services;
pub mod state;

use commands::{backup, categories, prompts, windows};
use db::Database;
use state::AppState;
use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg(test)]
mod tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            windows::focus_main_window(app);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .menu(menu::build_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-main" => windows::focus_main_window(app),
            "toggle-sticky" => {
                if let Some(window) = app.get_webview_window("sticky") {
                    let visible = window.is_visible().unwrap_or(false);
                    if visible {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let app = app.clone();
                    let state = app.state::<AppState>().inner().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = windows::capture_sticky_window_state(&app, &state, !visible).await;
                    });
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("promptdock.sqlite3");
            let database = tauri::async_runtime::block_on(Database::connect_path(&database_path))?;
            app.manage(AppState::new(database, database_path));
            let state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::block_on(windows::restore_sticky_window(app.handle(), &state))?;

            let shortcut_result =
                app.global_shortcut()
                    .on_shortcut("Alt+Space", |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = windows::reveal_quick_window(app, None);
                        }
                    });
            if let Ok(mut status) = app.state::<AppState>().shortcut.write() {
                match shortcut_result {
                    Ok(()) => status.registered = true,
                    Err(error) => status.error = Some(error.to_string()),
                }
            }

            if let Some(sticky) = app.get_webview_window("sticky") {
                let sticky_for_events = sticky.clone();
                let app_for_events = app.handle().clone();
                sticky.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sticky_for_events.hide();
                        let app = app_for_events.clone();
                        let state = app.state::<AppState>().inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = windows::capture_sticky_window_state(&app, &state, false).await;
                        });
                    } else if matches!(event, WindowEvent::Moved(_)) {
                        let app = app_for_events.clone();
                        let state = app.state::<AppState>().inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = windows::capture_sticky_window_state(&app, &state, true).await;
                        });
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
            windows::show_sticky_window,
            windows::hide_sticky_window,
            windows::get_sticky_settings,
            windows::set_sticky_settings,
            windows::get_runtime_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PromptDock");
}
