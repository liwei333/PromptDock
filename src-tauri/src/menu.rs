use tauri::{
    AppHandle, Runtime,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EditMenuEntry {
    Undo,
    Redo,
    Separator,
    Cut,
    Copy,
    Paste,
    SelectAll,
}

#[cfg(test)]
pub(crate) const EDIT_MENU_ENTRIES: [EditMenuEntry; 8] = [
    EditMenuEntry::Undo,
    EditMenuEntry::Redo,
    EditMenuEntry::Separator,
    EditMenuEntry::Cut,
    EditMenuEntry::Copy,
    EditMenuEntry::Paste,
    EditMenuEntry::Separator,
    EditMenuEntry::SelectAll,
];

pub(crate) fn build_menu<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open_main = MenuItem::with_id(handle, "open-main", "打开主窗口", true, None::<&str>)?;
    let toggle_sticky =
        MenuItem::with_id(handle, "toggle-sticky", "切换便签模式", true, None::<&str>)?;
    let app_separator = PredefinedMenuItem::separator(handle)?;
    let quit = MenuItem::with_id(handle, "quit", "退出 PromptDock", true, Some("Cmd+Q"))?;
    let app_menu = Submenu::with_items(
        handle,
        "PromptDock",
        true,
        &[&open_main, &toggle_sticky, &app_separator, &quit],
    )?;

    let undo = PredefinedMenuItem::undo(handle, None)?;
    let redo = PredefinedMenuItem::redo(handle, None)?;
    let edit_separator_one = PredefinedMenuItem::separator(handle)?;
    let cut = PredefinedMenuItem::cut(handle, None)?;
    let copy = PredefinedMenuItem::copy(handle, None)?;
    let paste = PredefinedMenuItem::paste(handle, None)?;
    let edit_separator_two = PredefinedMenuItem::separator(handle)?;
    let select_all = PredefinedMenuItem::select_all(handle, None)?;
    let edit_menu = Submenu::with_items(
        handle,
        "编辑",
        true,
        &[
            &undo,
            &redo,
            &edit_separator_one,
            &cut,
            &copy,
            &paste,
            &edit_separator_two,
            &select_all,
        ],
    )?;

    Menu::with_items(handle, &[&app_menu, &edit_menu])
}
