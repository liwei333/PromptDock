pub mod commands;
pub mod db;
pub mod domain;
pub mod repositories;
pub mod state;

use commands::{categories, prompts, windows};
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
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("promptdock.sqlite3");
            let database = tauri::async_runtime::block_on(Database::connect_path(&database_path))?;
            app.manage(AppState::new(database, database_path));

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
                sticky.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sticky_for_events.hide();
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
