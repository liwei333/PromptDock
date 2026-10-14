use tauri::{
    AppHandle, Runtime,
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
};

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

    let mut edit_items = Vec::with_capacity(EDIT_MENU_ENTRIES.len());
    for entry in EDIT_MENU_ENTRIES {
        let item = match entry {
            EditMenuEntry::Undo => PredefinedMenuItem::undo(handle, None)?,
            EditMenuEntry::Redo => PredefinedMenuItem::redo(handle, None)?,
            EditMenuEntry::Separator => PredefinedMenuItem::separator(handle)?,
            EditMenuEntry::Cut => PredefinedMenuItem::cut(handle, None)?,
            EditMenuEntry::Copy => PredefinedMenuItem::copy(handle, None)?,
            EditMenuEntry::Paste => PredefinedMenuItem::paste(handle, None)?,
            EditMenuEntry::SelectAll => PredefinedMenuItem::select_all(handle, None)?,
        };
        edit_items.push(item);
    }
    let edit_item_refs: Vec<&dyn IsMenuItem<R>> = edit_items
        .iter()
        .map(|item| item as &dyn IsMenuItem<R>)
        .collect();
    let edit_menu = Submenu::with_items(handle, "编辑", true, &edit_item_refs)?;

    Menu::with_items(handle, &[&app_menu, &edit_menu])
}
