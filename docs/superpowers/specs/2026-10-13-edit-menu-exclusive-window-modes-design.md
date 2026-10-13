# PromptDock Edit Menu and Exclusive Window Modes Design

## Status

Approved in conversation on 2026-10-13. This specification narrows the requested change to two related macOS behaviors: restoring standard text-edit shortcuts and making the full/sticky interfaces mutually exclusive modes.

## Problem statement

PromptDock replaces Tauri's default macOS menu with a custom application menu that contains only main-window, sticky-window and quit actions. This removes the standard Cocoa Edit responders, so focused WebView inputs cannot use the normal `Cmd+V`, `Cmd+C`, `Cmd+X`, `Cmd+A`, undo and redo actions.

Sticky mode currently opens the independent 340×270 window without hiding the full main window. Its existing header management icon and footer management action have no click behavior. The user requires exactly one visible product mode: entering sticky hides the full window, and an icon in sticky switches back to the full window while hiding sticky.

## Goals

- Restore standard macOS editing actions for every input and textarea.
- Preserve the custom PromptDock application menu and `Cmd+Q` behavior.
- Make full and sticky windows mutually exclusive when switching modes.
- Provide an accessible icon button in sticky mode that switches to full mode.
- Make the sticky footer management action switch to full mode instead of remaining inert.
- Keep quick search independent: it may temporarily overlay either mode and closes according to its existing rules.
- Preserve sticky size, always-on-top preference, saved position and five-slot behavior.

## Non-goals

- Converting sticky mode into an in-page route or resizing the main window.
- Changing prompt data, database schema, clipboard contents or backup format.
- Adding new preferences for the exclusive-mode behavior.
- Changing the sticky close button: close continues to hide sticky without automatically opening the full window.
- Redesigning the sticky layout beyond replacing the inert management glyph with a clear mode-switch icon and wiring the footer action.

## Selected architecture

Use native mutually exclusive window transitions owned by the Rust window-command layer. Frontend components call one command for each transition; they do not chain separate show and hide IPC calls.

Two commands form the public contract:

- `enter_sticky_mode`: restore sticky position/top preference, show and focus sticky, persist `visible=true`, then hide main.
- `enter_main_mode`: show, unminimize and focus main first; capture sticky position with `visible=false`, then hide sticky.

Showing the target before hiding the source is an intentional failure-safety rule. If the target cannot be shown, the current mode remains visible. Persistence errors are returned as structured native errors and must not be represented as successful switches.

Existing helpers may be reused internally, but all mode-switching entry points must use the same transition functions:

- main sidebar “便签模式”;
- main toolbar “便签模式”;
- pinned panel “打开便签窗”;
- sticky header mode-switch icon;
- sticky footer “管理置顶”;
- app-menu “打开主窗口” and sticky toggle/switch action;
- single-instance activation, which returns to full mode.

The quick window remains an overlay and is not considered a persistent product mode.

## macOS menu

The menu bar contains the existing PromptDock application submenu plus a standard “编辑” submenu built from Tauri `PredefinedMenuItem` values:

1. Undo
2. Redo
3. Separator
4. Cut
5. Copy
6. Paste
7. Paste and Match Style on macOS when supported
8. Separator
9. Select All

Using predefined items is required because they supply the standard accelerators and connect to the native responder chain. JavaScript keyboard interception or direct clipboard reads inside input components is explicitly rejected.

## Sticky UI behavior

The sticky title bar keeps the always-on-top control and close control. The currently inert `⋯` button becomes a window-mode icon button:

- title: `切换到完整模式`
- aria-label: `切换到完整模式`
- action: `windowApi.enterMainMode()`
- visual: a compact outlined full-window glyph consistent with the existing monochrome title-bar controls

The footer “管理置顶 →” invokes the same command. Full mode opens on its last native size/location; sticky hides only after main is visible and focused. No prompt data is mutated.

## Frontend API

`windowApi` exposes:

- `enterStickyMode(): Promise<{ mode: "sticky" }>`
- `enterMainMode(): Promise<{ mode: "main" }>`

Old `showSticky()` use sites are migrated to `enterStickyMode()`. `hideSticky()` remains for the sticky close control. A standalone public `showMain()` is unnecessary because mode transitions must preserve exclusivity.

## Error handling

- Main-mode entry failures leave sticky visible and surface no false success.
- Sticky-mode entry failures leave main visible.
- The frontend mode buttons await the command; repeated clicks are naturally serialized by the native event loop and idempotent window operations.
- Sticky persistence continues through the existing settings repository. Transition code captures the actual position before hiding sticky.
- App-menu transitions run asynchronously; errors are not logged with prompt content.

## Verification strategy

### Automated red/green coverage

- Add a frontend test proving the sticky title-bar icon calls `enterMainMode`.
- Add a frontend test proving the footer management action calls the same transition.
- Update existing sticky tests/mocks for the new API contract.
- Add a small Rust-testable menu specification/helper if it can assert the presence and order of Edit actions without requiring a live AppKit context; otherwise compilation plus native inspection is the appropriate boundary test.
- Run the entire frontend and Rust suites, strict TypeScript, Rustfmt, Clippy and production build.

### Native macOS acceptance

1. Copy known multiline Chinese/special-character text from another app.
2. Open a new prompt and paste into title, tags, description and body using `Cmd+V`.
3. Verify `Cmd+A`, `Cmd+C`, `Cmd+X`, `Cmd+Z` and `Shift+Cmd+Z` in a focused field.
4. Enter sticky mode from every visible main-window entry point and confirm main is hidden.
5. Click the new sticky icon and confirm main is visible/focused while sticky is hidden.
6. Repeat through the sticky footer, application menu and second-instance activation.
7. Confirm sticky size, top preference and position persistence are unchanged.

## Delivery

Commit the behavioral change on `feat/promptdock-macos-v1.1`, run all gates, rebuild and fully ad-hoc-sign the arm64 `.app`, regenerate the DMG, and replace user-facing deliverables with updated SHA-256 checksums. Do not push or merge.
