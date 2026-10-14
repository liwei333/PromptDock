# Changelog

All notable changes to PromptDock are documented in this file.

## [1.1.1] - 2026-10-14

### Added

- Public MIT license and GitHub release workflow.
- Native installers for macOS Apple Silicon, macOS Intel, and Windows x64.
- Platform-aware global shortcuts: `Option + Space` on macOS and
  `Ctrl + Alt + Space` on Windows.

### Fixed

- Keep sticky mode active when PromptDock is restored from the macOS Dock.
- Enable native dragging for the borderless macOS sticky window.
- Restore native edit-menu clipboard shortcuts in text fields.
- Keep full mode and sticky mode mutually exclusive.

### Distribution notes

- macOS release artifacts are ad-hoc signed but are not notarized.
- Windows release artifacts are currently unsigned and may display a
  Microsoft Defender SmartScreen warning.

## [1.1.0] - 2026-10-13

- Initial local desktop release with SQLite prompt storage, clipboard copy,
  quick search, template variables, JSON backup/restore, and sticky prompts.
