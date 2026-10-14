use crate::{
    menu::QUIT_ACCELERATOR,
    state::{DesktopPlatform, shortcut_configuration},
};

#[test]
fn desktop_shortcuts_do_not_conflict_with_native_window_controls() {
    assert_eq!(
        shortcut_configuration(DesktopPlatform::MacOs),
        ("Alt+Space", "Option+Space")
    );
    assert_eq!(
        shortcut_configuration(DesktopPlatform::Windows),
        ("Ctrl+Alt+Space", "Ctrl+Alt+Space")
    );
    assert_eq!(QUIT_ACCELERATOR, "CmdOrCtrl+Q");
}
