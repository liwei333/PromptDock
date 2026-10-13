# Known Issues and Release Limits

## Distribution signing

The local release is ad-hoc/linker signed only. It is not signed with an Apple Developer ID and is not notarized by Apple. Gatekeeper may therefore require Finder → right-click → Open on first launch. This does not affect local functionality, but it is not suitable for public distribution without a signing identity and notarization workflow.

## DMG cosmetic packaging

Tauri generated the `.app` successfully. Its bundled `create-dmg` Finder AppleScript failed during cosmetic window-layout automation on macOS 26.4.1. The disk contents were verified (`PromptDock.app`, Applications link, volume icon) and a compressed DMG was produced with `hdiutil`; `hdiutil verify` reports a valid checksum. The installer is functional, but its Finder icon placement may use the system default rather than the intended custom layout.

## Manual acceptance still required

The following release-candidate checks need a person to run them on the intended production setup before a public release:

- Paste a normal and a template prompt into both Notes and VS Code and compare every character.
- Put Safari/VS Code in front, press Option+Space, and verify focus/keyboard behavior.
- Force-terminate the app immediately after a committed write and confirm recovery.
- Exercise merge/replace import through the native open/save dialogs using a disposable library.
- Verify always-on-top across Spaces/full-screen apps and after unplugging an external display.
- Exercise simultaneous main/quick/sticky mutations with real prompts.
- Run the full CRUD/export workflow while the Mac network interface is disabled.

These are recorded as `NOT_TESTED`, not silently treated as passed.

## Product boundaries

- macOS 13.0+ only; the supplied binary targets Apple Silicon (`aarch64`).
- Business data is intentionally plain SQLite at `~/Library/Application Support/com.promptdock.local/promptdock.sqlite3`; anyone with access to the macOS account can read it.
- Category rename/delete-with-move exists in the Rust service layer but is a P1 product item and is not exposed as a V1.1 primary UI flow; create/view/filter are the P0 category UI.
- There is no account, cloud sync, mobile client, updater, telemetry, automatic paste, model API or accessibility automation.
