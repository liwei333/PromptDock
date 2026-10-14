use crate::menu::{EDIT_MENU_ENTRIES, EditMenuEntry};

#[test]
fn edit_menu_uses_the_required_native_responder_order() {
    assert_eq!(
        EDIT_MENU_ENTRIES,
        [
            EditMenuEntry::Undo,
            EditMenuEntry::Redo,
            EditMenuEntry::Separator,
            EditMenuEntry::Cut,
            EditMenuEntry::Copy,
            EditMenuEntry::Paste,
            EditMenuEntry::Separator,
            EditMenuEntry::SelectAll,
        ]
    );
}
