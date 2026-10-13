# PromptDock Edit Menu and Exclusive Window Modes Design

## Status

Approved in conversation on 2026-10-13. This specification narrows the requested change to two related macOS behaviors: restoring standard text-edit shortcuts and making the full/sticky interfaces mutually exclusive modes.

## Problem statement

PromptDock replaces Tauri's default macOS menu with a custom application menu that contains only main-window, sticky-window and quit actions. This removes the standard Cocoa Edit responders, so focused WebView inputs cannot use the normal `Cmd+V`, `Cmd+C`, `Cmd+X`, `Cmd+A`, undo and redo actions.

Sticky mode currently opens the independent 340×270 window without hiding the full main window. Its existing header management icon and footer management action have no click behavior. Full and sticky must become mutually exclusive: at most one may be visible. A successful transition ends with exactly its target mode visible. The explicit sticky close control is the sole intentional exception and may leave neither product-mode window visible.

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
- `enter_main_mode`: show, unminimize and focus main first; capture and persist sticky position with `visible=false`, then hide sticky.

All mode transitions are serialized by a shared `tokio::sync::Mutex<()>` stored behind `Arc` in `AppState`. `enter_sticky_mode`, `enter_main_mode`, startup mode reconciliation, application-menu transitions, single-instance activation, explicit sticky hiding, and every event handler that writes sticky visibility acquire the same mutex for the entire read/configure/show/persist/hide sequence. Frontend click suppression is UX only and is never relied upon for correctness.

Showing the target before hiding the source is an intentional safety rule, but later failures require compensation. Under the transition mutex, the implementation snapshots source/target visibility and current sticky settings, configures and shows/focuses the target while leaving the source visible, persists the intended sticky visibility, and only then hides the source.

| Failure point | Required final/compensated state |
|---|---|
| Configure, show, unminimize or focus target | Best-effort restore target to its prior visibility; leave source visible; keep prior persisted visibility. |
| Persist intended visibility | Best-effort restore target to its prior visibility; leave source visible; keep/restore prior persisted visibility. |
| Hide source | Best-effort restore the previous persisted visibility and target visibility; keep or restore the source visible. |
| Compensation also fails | Return the original structured error with sanitized rollback-failure detail; never report success. |

No failure path may be represented as a successful switch. Position movement persistence updates only position/monitor/scale fields and never rewrites `visible`, so a stale `Moved` task cannot revert the selected mode.

Existing helpers may be reused internally, but all mode-switching entry points must use the same transition functions:

- main sidebar “便签模式”;
- main toolbar “便签模式”;
- pinned panel “打开便签窗”;
- sticky header mode-switch icon;
- sticky footer “管理置顶”;
- app-menu “打开主窗口” and sticky toggle/switch action;
- single-instance activation, which returns to full mode.

The quick window remains an overlay and is not considered a persistent product mode.

Startup uses the same serialized transition implementation instead of the current independent `restore_sticky_window` show operation. If persisted `visible=true`, setup restores sticky preferences and clamped position, shows sticky and hides main. Otherwise setup explicitly hides sticky and shows main. Interactive transitions are not registered as usable paths until this reconciliation finishes.

Direct visibility bypasses are removed after migration:

- remove `show_sticky_window` from the invoke handler and frontend API;
- remove `visible`, `x`, `y`, `monitorName` and `scaleFactor` from the frontend-settable `StickySettingsPatch` contract;
- retain only `alwaysOnTop` as a frontend setting mutation;
- allow visibility changes only through `enter_sticky_mode`, `enter_main_mode`, startup reconciliation and explicit sticky hide/close.

## macOS menu

The menu bar contains the existing PromptDock application submenu plus a standard “编辑” submenu built from Tauri `PredefinedMenuItem` values:

1. Undo
2. Redo
3. Separator
4. Cut
5. Copy
6. Paste
7. Separator
8. Select All

Using predefined items is required because they supply the standard accelerators and connect to the native responder chain. JavaScript keyboard interception or direct clipboard reads inside input components is explicitly rejected.

Paste and Match Style is not part of this change because the locked Tauri 2.12.3 `PredefinedMenuItem` wrapper does not expose it. It may be added later through a separately specified, compile-gated native implementation.

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

`setStickySettings()` is narrowed to `{ alwaysOnTop?: boolean }`. Position and visibility are native lifecycle state, not frontend-settable mode state.

Application-menu mappings are explicit:

- `open-main` always invokes `enter_main_mode`;
- the sticky mode item invokes `enter_main_mode` when sticky is visible and otherwise invokes `enter_sticky_mode`;
- its label is `切换便签模式` unless the implementation can update it reliably to `切换到完整模式` / `切换到便签模式` after each successful transition;
- single-instance activation always invokes `enter_main_mode`.

## Error handling

- Main-mode entry failures leave sticky visible and surface no false success.
- Sticky-mode entry failures leave main visible.
- The shared transition mutex serializes repeated, rapid and opposing transitions. Frontend controls await the command and disable themselves while pending only to provide clear UX.
- Sticky persistence continues through the existing settings repository. Transition code captures the actual position before hiding sticky.
- Spawned menu and single-instance transitions inspect their `Result`. Failures are recorded through a sanitized native error log containing no prompt content and are never silently discarded.
- Explicit sticky close remains intentionally different from mode switching: it persists `visible=false`, hides sticky and leaves main hidden.

## Verification strategy

### Automated red/green coverage

- Add a frontend test proving the sticky title-bar icon calls `enterMainMode`.
- Add a frontend test proving the footer management action calls the same transition.
- Add frontend tests proving all three full-window sticky entry points call `enterStickyMode`, command rejection is handled without an unhandled promise rejection, and the new `{ mode: ... }` contracts are mapped correctly.
- Update existing sticky tests/mocks for the narrowed settings and new API contract.
- Extract transition sequencing behind a testable native window-operations/state-machine boundary. Rust tests cover successful entry in both directions, idempotent re-entry, failure of each target operation, persistence failure, source-hide failure, startup with persisted sticky-visible/hidden state, and concurrent opposing requests. Every case asserts actual modeled visibility and persisted `visible` agree.
- Add a regression test proving a movement update changes only position metadata and cannot overwrite visibility.
- Extract a pure menu descriptor and test the required Edit-item order; compilation plus native inspection verifies the AppKit responder boundary.
- Run the entire frontend and Rust suites, strict TypeScript, Rustfmt, Clippy and production build.

### Native macOS acceptance

1. Copy known multiline Chinese/special-character text from another app.
2. Open a new prompt and paste into title, tags, description and body using `Cmd+V`.
3. Verify `Cmd+A`, `Cmd+C`, `Cmd+X`, `Cmd+Z` and `Shift+Cmd+Z` in a focused field.
4. Enter sticky mode from every visible main-window entry point and confirm main is hidden.
5. Click the new sticky icon and confirm main is visible/focused while sticky is hidden.
6. Repeat through the sticky footer, application menu and second-instance activation.
7. Close sticky explicitly and confirm main stays hidden as the intentional zero-window exception; reopen through the app menu/Dock.
8. Rapidly alternate main/sticky switches and verify the final visible window agrees with persisted `StickySettings.visible`.
9. Relaunch once with persisted sticky-visible and once with sticky-hidden state and confirm only the selected mode appears.
10. Confirm sticky size, top preference and position persistence are unchanged.

## Delivery

Commit the behavioral change on `feat/promptdock-macos-v1.1`, run all gates, rebuild and fully ad-hoc-sign the arm64 `.app`, regenerate the DMG, and replace user-facing deliverables with updated SHA-256 checksums. Do not push or merge.
