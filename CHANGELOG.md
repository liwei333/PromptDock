# Changelog

All notable changes to PromptDock are documented in this file.

## [1.1.2] - 2026-10-16

### Added

- A macOS-native lightweight workbench UI with reusable, accessible controls.
- Dashboard statistics, category management, richer filtering, and improved
  prompt detail and editor experiences.
- Comfortable and compact sticky-window density modes with one-click switching.

### Changed

- Simplified sticky-window controls by removing duplicate mode and settings
  actions while preserving direct management and sorting entry points.
- Unified primary button, dialog, selector, toggle, tooltip, and feedback styles.
- Strengthened cross-window intent delivery and asynchronous UI state handling.

### Fixed

- Prevent stale filters, copy feedback, and repeated async requests from leaking
  into later interactions.
- Preserve category, tag, template-variable, quick-palette, and sticky-window
  state across the relevant workflows.

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
