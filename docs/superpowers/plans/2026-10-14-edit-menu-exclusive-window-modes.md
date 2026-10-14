# PromptDock Edit Menu and Exclusive Window Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore native macOS text-edit shortcuts and make PromptDock's full and sticky windows mutually exclusive, with reliable switching, rollback, persistence, and updated release artifacts.

**Architecture:** Add a standard Cocoa-backed Edit submenu through Tauri predefined menu items, then route every full/sticky visibility change through one serialized Rust transition coordinator. The coordinator operates behind a testable runtime boundary, snapshots window/settings state, compensates failed transitions, and exposes only `enter_sticky_mode`, `enter_main_mode`, and explicit sticky close to the Vue layer.

**Tech Stack:** Tauri 2.12.x, Rust 2024, Tokio mutexes, SQLx SQLite settings storage, Vue 3, TypeScript, Pinia, Vitest, Vue Test Utils, macOS AppKit/Tauri predefined menu responders.

---

## File responsibility map

- Create `src-tauri/src/menu.rs`: own the deterministic application/Edit menu descriptor and Tauri menu construction; no window-transition logic.
- Create `src-tauri/src/window_mode.rs`: own the mode enum, transition runtime boundary, serialized transition/rollback algorithm, explicit sticky hide, position-only persistence, always-on-top mutation, and production Tauri runtime adapter.
- Create `src-tauri/src/tests/menu_tests.rs`: verify exact Edit-menu semantic order independently of AppKit.
- Create `src-tauri/src/tests/window_mode_tests.rs`: use an in-memory fake runtime with fault injection and operation barriers to verify success, rollback, zero-window behavior, startup, races, and serialization.
- Modify `src-tauri/src/domain/errors.rs`: preserve the original structured error code when a transition also reports sanitized rollback failures.
- Modify `src-tauri/src/commands/windows.rs`: keep thin Tauri command wrappers and quick-window/runtime-info commands; remove direct sticky visibility mutation helpers.
- Modify `src-tauri/src/state.rs`: add the one shared `Arc<tokio::sync::Mutex<()>>` used by every sticky settings read-modify-write that can race with mode changes.
- Modify `src-tauri/src/lib.rs`: install the full menu, reconcile startup mode, route menu/single-instance/window events through the coordinator, and register the new invoke commands.
- Modify `src-tauri/src/tests/mod.rs`: register the new Rust test modules.
- Create `src/tests/window-api.test.ts`: verify exact IPC command names and typed payloads.
- Create `src/tests/main-window.test.ts`: verify all three full-window entry points call the exclusive transition and rejected transitions become UI feedback rather than unhandled promises.
- Modify `src/tests/sticky-window.test.ts`: verify header icon/footer switching, explicit close, pending suppression, and rejection handling.
- Modify `src/api/commands.ts` and `src/types/runtime.ts`: publish narrow mode APIs and prevent frontend visibility/position writes.
- Modify `src/windows/MainWindow.vue`: route all sticky entry points through one guarded handler.
- Modify `src/windows/StickyWindow.vue`: add the full-mode icon, wire the footer, guard transitions, and keep explicit close semantics.
- Modify `src/styles/global.css`: style the outlined full-window glyph and disabled/pending controls without changing the 340×270 layout.
- Modify `docs/testing/test-report.md`, `docs/testing/acceptance-report.md`, and `docs/testing/known-issues.md`: record only actually observed results.
- Modify `README.md`: document native Edit shortcuts and mutually exclusive full/sticky switching in the published usage notes.
- Create `.gitattributes`: mark the tracked `.vscode` editor metadata as `export-ignore` so `git archive` meets the documented source-package boundary.
- Replace the user-facing files in `/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs` only after all release verification succeeds.

## Post-approval prerequisite (performed by the plan author before handoff)

Once the independent plan review returns `Approved`, commit this plan before any implementation task starts:

```bash
git add docs/superpowers/plans/2026-10-14-edit-menu-exclusive-window-modes.md
git commit -m "docs: plan edit menu and exclusive window modes"
```

Then rerun `git status --short --branch` and require a clean worktree. This guarantees Task 0's baseline is true and `git archive HEAD` includes both the approved specification and implementation plan.

### Task 0: Verify the implementation boundary before editing code

**Files:** None.

- [ ] **Step 1: Run the repository-required preflight**

```bash
pwd
git status --short --branch
git branch --show-current
git log -1 --oneline
```

Expected: working directory is `/Users/qianduoduo/Desktop/AI_app/PromptDock`, branch is `feat/promptdock-macos-v1.1`, the latest commit includes the approved design/plan documentation, and there are no unexplained user modifications. If any unrelated modification exists, preserve it and stop only the overlapping task rather than stashing, resetting, or overwriting it.

- [ ] **Step 2: Confirm scope and toolchain without changing dependencies**

Run `node --version`, `pnpm --version`, `rustc --version`, and `cargo --version`; record versions with the verification evidence. No new dependency is planned: the crate-private async runtime trait uses static dispatch on the existing Rust toolchain, and all frontend icons remain inline/local.

### Task 1: Restore Cocoa edit responders with a testable menu descriptor

**Files:**
- Create: `src-tauri/src/menu.rs`
- Create: `src-tauri/src/tests/menu_tests.rs`
- Modify: `src-tauri/src/tests/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing Edit-menu order test**

Add the test module registration:

```rust
// src-tauri/src/tests/mod.rs
mod menu_tests;
```

Write a pure descriptor assertion before adding `menu.rs`:

```rust
// src-tauri/src/tests/menu_tests.rs
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
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml edit_menu_uses_the_required_native_responder_order`

Expected: compile failure because `crate::menu` and `EDIT_MENU_ENTRIES` do not exist.

- [ ] **Step 3: Add the descriptor and native menu builder**

Create `src-tauri/src/menu.rs` with an equality-testable enum/constant and a `build_menu` function. The Edit submenu must instantiate these exact Tauri primitives, not ordinary `MenuItem`s or JavaScript handlers:

```rust
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
```

Build the application submenu exactly as today except rename the sticky item to `切换便签模式`, then build `编辑` with:

```rust
let undo = PredefinedMenuItem::undo(handle, None)?;
let redo = PredefinedMenuItem::redo(handle, None)?;
let separator_1 = PredefinedMenuItem::separator(handle)?;
let cut = PredefinedMenuItem::cut(handle, None)?;
let copy = PredefinedMenuItem::copy(handle, None)?;
let paste = PredefinedMenuItem::paste(handle, None)?;
let separator_2 = PredefinedMenuItem::separator(handle)?;
let select_all = PredefinedMenuItem::select_all(handle, None)?;
let edit_menu = Submenu::with_items(
    handle,
    "编辑",
    true,
    &[&undo, &redo, &separator_1, &cut, &copy, &paste, &separator_2, &select_all],
)?;
```

Return `Menu::with_items(handle, &[&app_menu, &edit_menu])`. Do not add a JavaScript `keydown` workaround and do not add Paste and Match Style because Tauri 2.12.3 does not expose that predefined item.

- [ ] **Step 4: Use the builder and run the focused test/compile gate**

Add `pub mod menu;` to `src-tauri/src/lib.rs` and replace the inline `.menu(...)` body with `menu::build_menu`.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml edit_menu_uses_the_required_native_responder_order
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: one focused test passes and the Tauri menu code compiles.

- [ ] **Step 5: Commit the responder-chain fix**

```bash
git add src-tauri/src/menu.rs src-tauri/src/tests/menu_tests.rs src-tauri/src/tests/mod.rs src-tauri/src/lib.rs
git commit -m "fix: restore native macOS edit menu"
```

### Task 2: Build the serialized transition core through happy-path tests

**Files:**
- Create: `src-tauri/src/window_mode.rs`
- Create: `src-tauri/src/tests/window_mode_tests.rs`
- Modify: `src-tauri/src/tests/mod.rs`
- Modify: `src-tauri/src/state.rs`

Use @test-driven-development. Keep Tauri handles out of the state-machine tests: the fake implements the same runtime trait as the production adapter.

- [ ] **Step 1: Write failing happy-path, idempotence, startup, and zero-window tests**

Register `mod window_mode_tests;`. Define a `FakeRuntime` in the test file with mutex-protected fields:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Visibility { main: bool, sticky: bool }

struct FakeState {
    visibility: Visibility,
    persisted: StickySettings,
    operations: Vec<&'static str>,
    position: StickyPosition,
    failure: Option<FailurePoint>,
}
```

Add tests with explicit end-state assertions:

```rust
#[tokio::test]
async fn entering_sticky_shows_and_focuses_target_persists_then_hides_main() { /* ... */ }

#[tokio::test]
async fn entering_main_shows_unminimizes_focuses_persists_then_hides_sticky() { /* ... */ }

#[tokio::test]
async fn reentering_the_active_mode_remains_exclusive_and_succeeds() { /* both targets */ }

#[tokio::test]
async fn startup_reconciles_persisted_sticky_true_to_sticky_only() { /* ... */ }

#[tokio::test]
async fn startup_reconciles_persisted_sticky_false_to_main_only() { /* ... */ }

#[tokio::test]
async fn successful_switch_from_zero_windows_opens_only_the_requested_target() { /* both */ }
```

For each successful transition assert all three invariants:

```rust
assert_eq!(runtime.visibility(), expected_visibility);
assert_eq!(runtime.settings().visible, target == WindowMode::Sticky);
assert_eq!(runtime.operations(), expected_order);
```

- [ ] **Step 2: Run the transition tests and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_mode_tests -- --nocapture`

Expected: compile failure because `WindowMode`, `WindowModeRuntime`, `transition_to`, `reconcile_startup_mode`, and supporting types do not exist.

- [ ] **Step 3: Add the shared transition mutex to application state**

Modify `AppState`:

```rust
pub mode_transition: Arc<tokio::sync::Mutex<()>>,
```

Initialize it with `Arc::new(tokio::sync::Mutex::new(()))`. This is the only transition/settings RMW mutex; do not create per-command locks.

- [ ] **Step 4: Implement the minimal runtime boundary and successful transition sequence**

Create `src-tauri/src/window_mode.rs` with:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowMode { Main, Sticky }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProductWindow { Main, Sticky }

#[derive(Debug, Clone)]
pub(crate) struct ModeSnapshot {
    pub main_visible: bool,
    pub sticky_visible: bool,
    pub settings: StickySettings,
}

pub(crate) trait WindowModeRuntime: Send + Sync {
    fn read_settings(&self) -> impl Future<Output = Result<StickySettings, AppError>> + Send;
    fn write_settings<'a>(
        &'a self,
        settings: &'a StickySettings,
    ) -> impl Future<Output = Result<(), AppError>> + Send + 'a;
    fn is_visible(&self, window: ProductWindow) -> Result<bool, AppError>;
    fn show(&self, window: ProductWindow) -> Result<(), AppError>;
    fn hide(&self, window: ProductWindow) -> Result<(), AppError>;
    fn focus(&self, window: ProductWindow) -> Result<(), AppError>;
    fn unminimize(&self, window: ProductWindow) -> Result<(), AppError>;
    fn configure_sticky(&self, settings: &StickySettings) -> Result<(), AppError>;
    fn capture_sticky_position(&self, settings: &mut StickySettings) -> Result<(), AppError>;
    fn set_sticky_always_on_top(&self, value: bool) -> Result<(), AppError>;
}
```

Keep the trait crate-private/generic so no object-safe async-trait dependency is needed. Express its asynchronous operations as `impl Future + Send` so transition futures remain spawnable under generic bounds. `transition_to(runtime, mutex, target)` acquires the mutex before any snapshot read and holds it until success or compensation finishes.

Implement operation order exactly:

```text
Sticky target: snapshot -> configure sticky -> show sticky -> focus sticky
               -> write visible=true -> hide main
Main target:   snapshot -> show main -> unminimize main -> focus main
               -> capture sticky position -> write visible=false -> hide sticky
```

`reconcile_startup_mode` first reads settings under the same mutex and executes the matching internal transition without reacquiring the mutex.

- [ ] **Step 5: Make the happy-path suite GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_mode_tests -- --nocapture`

Expected: happy-path, re-entry, startup, and zero-window success tests pass.

- [ ] **Step 6: Commit the transition core**

```bash
git add src-tauri/src/window_mode.rs src-tauri/src/tests/window_mode_tests.rs src-tauri/src/tests/mod.rs src-tauri/src/state.rs
git commit -m "feat: add serialized window mode transitions"
```

### Task 3: Add compensation and race regression coverage

**Files:**
- Modify: `src-tauri/src/window_mode.rs`
- Modify: `src-tauri/src/tests/window_mode_tests.rs`
- Modify: `src-tauri/src/domain/errors.rs`

- [ ] **Step 1: Write the complete failure matrix as failing parameterized tests**

Extend `FailurePoint` so the fake can fail once at each target operation, settings write, source hide, and rollback operation. Cover both directions:

```rust
const STICKY_TARGET_FAILURES: &[FailurePoint] = &[
    FailurePoint::ConfigureSticky,
    FailurePoint::ShowSticky,
    FailurePoint::FocusSticky,
    FailurePoint::Persist,
    FailurePoint::HideMain,
];

const MAIN_TARGET_FAILURES: &[FailurePoint] = &[
    FailurePoint::ShowMain,
    FailurePoint::UnminimizeMain,
    FailurePoint::FocusMain,
    FailurePoint::CapturePosition,
    FailurePoint::Persist,
    FailurePoint::HideSticky,
];
```

For every case assert the command is `Err`, both windows return to their exact snapshot visibility, and all prior sticky settings are restored. Repeat target/persist/source-hide failures from `{main:false, sticky:false}` and assert compensation does not invent a visible source window.

Add one rollback-failure test that asserts `error.code()` is still the primary error's code (for example, `DATABASE_ERROR`), while the returned message contains sanitized `rollback failed` detail but no prompt text or raw persisted JSON. Use an ordered failure queue/fault counter rather than one `Option<FailurePoint>` so the fake can inject a primary failure and a later compensation failure deterministically.

- [ ] **Step 2: Run the failure matrix and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_mode_tests::transition_failures -- --nocapture`

Expected: failures show target windows/settings are not yet restored.

- [ ] **Step 3: Implement one compensation path used by every failure branch**

Add a helper conceptually equivalent to:

```rust
async fn compensate<R: WindowModeRuntime>(
    runtime: &R,
    snapshot: &ModeSnapshot,
    restore_settings: bool,
) -> Vec<String> {
    // Best-effort write prior settings when the transition may have persisted.
    // Restore main and sticky independently to their snapshotted visibility.
    // Return only sanitized operation labels/messages for rollback diagnostics.
}
```

Add a wrapper variant that preserves the original structured category instead of converting every combined failure to `NATIVE_ERROR`:

```rust
// src-tauri/src/domain/errors.rs
#[error("{original}；回滚失败：{rollback}")]
WindowTransition {
    original: Box<AppError>,
    rollback: String,
},

pub fn code(&self) -> &'static str {
    match self {
        Self::WindowTransition { original, .. } => original.code(),
        // existing mappings unchanged
    }
}
```

Refactor `From<AppError> for ErrorPayload` to obtain `let code = error.code();` before consuming/stringifying the value. `transition_error` returns the original error unchanged when compensation succeeds and `AppError::WindowTransition { original: Box::new(original), rollback: sanitized_labels }` only when compensation also fails. Add a unit assertion for both `error.code()` and `ErrorPayload.code`.

Do not log or serialize `StickySettings` or prompt data in these error strings.

- [ ] **Step 4: Write failing movement/settings race tests**

Add tests:

```rust
#[tokio::test]
async fn moved_event_updates_only_position_and_never_overwrites_visibility() { /* stale position input */ }

#[tokio::test]
async fn opposing_transitions_are_serialized_and_last_completed_request_wins() { /* barrier */ }

#[tokio::test]
async fn always_on_top_racing_with_each_transition_preserves_mode_and_preference() { /* both modes */ }

#[tokio::test]
async fn two_serialized_menu_toggles_choose_the_target_under_the_lock() { /* sticky then main */ }

#[tokio::test]
async fn explicit_hide_persists_false_hides_sticky_and_does_not_show_main() { /* ... */ }

#[tokio::test]
async fn explicit_hide_persist_failure_restores_the_exact_snapshot() { /* ... */ }

#[tokio::test]
async fn explicit_hide_native_failure_restores_settings_and_visibility() { /* ... */ }

#[tokio::test]
async fn explicit_hide_rollback_failure_keeps_the_primary_error_code() { /* ... */ }
```

Use a `tokio::sync::Barrier` or `Notify` in the fake to overlap tasks deterministically; never use timing sleeps.

- [ ] **Step 5: Implement serialized position-only, preference-only, and explicit-close mutations**

Under the same mutex add:

```rust
pub(crate) async fn persist_sticky_position<R: WindowModeRuntime>(...) -> Result<StickySettings, AppError>;
pub(crate) async fn set_sticky_always_on_top<R: WindowModeRuntime>(..., value: bool) -> Result<StickySettings, AppError>;
pub(crate) async fn hide_sticky_explicitly<R: WindowModeRuntime>(...) -> Result<(), AppError>;
pub(crate) async fn toggle_product_mode<R: WindowModeRuntime>(...) -> Result<WindowMode, AppError>;
```

`persist_sticky_position` reads the latest settings only after acquiring the mutex, mutates only `x`, `y`, `monitor_name`, and `scale_factor`, and writes that merged record. `set_sticky_always_on_top` mutates only `always_on_top`, applies it natively, and writes the merged record. Neither helper calls `show`, `hide`, or `set_position`. `hide_sticky_explicitly` captures position, writes `visible=false`, hides sticky, and leaves main untouched; compensate if persistence/hide fails. `toggle_product_mode` acquires the mutex first, determines its target from the sticky window's visibility while holding the lock, then calls the non-relocking internal transition; it must not inspect visibility before acquiring the mutex.

- [ ] **Step 6: Run the full state-machine suite until GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml window_mode_tests -- --nocapture`

Expected: all success, idempotence, failure, zero-window, startup, movement, preference-race, and concurrency tests pass with no sleeps/flakes.

- [ ] **Step 7: Commit the rollback/race guarantees**

```bash
git add src-tauri/src/window_mode.rs src-tauri/src/tests/window_mode_tests.rs src-tauri/src/domain/errors.rs
git commit -m "fix: compensate failed window mode switches"
```

### Task 4: Connect Tauri commands, lifecycle events, menu, and single-instance activation

**Files:**
- Modify: `src-tauri/src/window_mode.rs`
- Modify: `src-tauri/src/commands/windows.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement the production Tauri runtime adapter**

Add `TauriWindowModeRuntime` to `window_mode.rs`. It owns cloned `AppHandle` and `AppState`, resolves `main`/`sticky` by label, delegates settings reads/writes to `SettingsRepository`, clamps restored sticky position to the selected/current monitor, and captures actual outer position/monitor/scale. Every missing-window/native error maps to `AppError::Native` with a user-safe message.

Keep `read_sticky_settings`/`write_sticky_settings` with the runtime code or expose narrow helpers; do not leave a second visibility-writing implementation in `commands/windows.rs`.

- [ ] **Step 2: Replace the public window commands**

In `src-tauri/src/commands/windows.rs`, delete `show_sticky_window`, the old whole-record `capture_sticky_window_state`, `restore_sticky_window`, and direct `focus_main_window`. Add thin wrappers:

```rust
#[derive(Debug, Serialize)]
pub struct ModeResult { pub mode: WindowMode }

#[tauri::command]
pub async fn enter_sticky_mode(app: AppHandle, state: State<'_, AppState>) -> CommandResult<ModeResult>;

#[tauri::command]
pub async fn enter_main_mode(app: AppHandle, state: State<'_, AppState>) -> CommandResult<ModeResult>;
```

Narrow the patch contract:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StickySettingsPatch {
    pub always_on_top: Option<bool>,
}
```

`set_sticky_settings` calls only the serialized preference helper. `hide_sticky_window` calls only explicit-close. Preserve `get_sticky_settings`, quick-window commands, and runtime info.

- [ ] **Step 3: Route startup and every native entry point through the coordinator**

Update `src-tauri/src/lib.rs`:

- setup: after `app.manage`, call `reconcile_startup_mode` synchronously before registering interactive handlers;
- invoke handler: add `enter_sticky_mode` and `enter_main_mode`, remove `show_sticky_window`;
- `open-main`: spawn `enter_main_mode`;
- `toggle-sticky`: spawn `toggle_product_mode`; the coordinator inspects sticky visibility only after acquiring the shared mutex and performs the non-relocking internal transition;
- single-instance callback: spawn `enter_main_mode`;
- macOS `RunEvent::Reopen`: spawn `enter_main_mode`, including when `has_visible_windows` is false after explicit sticky close;
- sticky close event: prevent close, then spawn explicit sticky hide (do not hide before persistence);
- sticky moved event: spawn the position-only update;
- quick close remains independent.

Use one helper for spawned work:

```rust
fn spawn_window_task<F>(label: &'static str, future: F)
where
    F: Future<Output = Result<(), AppError>> + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        if let Err(error) = future.await {
            eprintln!("PromptDock {label} failed [{}]", error.code());
        }
    });
}
```

The log may contain operation label/error code and a sanitized native message; never discard `Result` and never include prompt content, settings JSON, or database values.

Because handling Dock reactivation requires a run callback, finish construction with `Builder::build(tauri::generate_context!())`, then call `app.run(|app, event| { ... })` and handle `tauri::RunEvent::Reopen { .. }` there instead of ending with `Builder::run(...)`. The reopen callback must enqueue `enter_main_mode` through the same coordinator and error-reporting helper; it must not call `window.show()` directly.

- [ ] **Step 4: Remove all native bypasses by search**

Run:

```bash
rg -n "show_sticky_window|focus_main_window|restore_sticky_window|capture_sticky_window_state|let _ = window\.(show|hide)|visible: Option<bool>|x: Option<i32>" src-tauri/src
```

Expected: no old visibility helper/patch field or discarded product-window show/hide result remains. Any quick-window result is reviewed separately because quick is explicitly outside product mode.

- [ ] **Step 5: Run Rust formatting, tests, and lint**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Expected: all commands exit 0; no dead bypass API or async-trait warning remains.

- [ ] **Step 6: Commit the native integration**

```bash
git add src-tauri/src/window_mode.rs src-tauri/src/commands/windows.rs src-tauri/src/lib.rs
git commit -m "feat: enforce exclusive native window modes"
```

### Task 5: Publish and consume the narrow frontend mode contract

**Files:**
- Create: `src/tests/window-api.test.ts`
- Create: `src/tests/main-window.test.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/types/runtime.ts`
- Modify: `src/tests/sticky-window.test.ts`
- Modify: `src/windows/MainWindow.vue`
- Modify: `src/windows/StickyWindow.vue`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing IPC mapping tests**

Mock `@tauri-apps/api/core` before importing the API and assert exact calls:

```ts
it("maps exclusive mode commands to their exact IPC names", async () => {
  invoke.mockResolvedValueOnce({ mode: "sticky" });
  await expect(windowApi.enterStickyMode()).resolves.toEqual({ mode: "sticky" });
  expect(invoke).toHaveBeenLastCalledWith("enter_sticky_mode");

  invoke.mockResolvedValueOnce({ mode: "main" });
  await expect(windowApi.enterMainMode()).resolves.toEqual({ mode: "main" });
  expect(invoke).toHaveBeenLastCalledWith("enter_main_mode");
});

it("sends only the always-on-top preference", async () => {
  await windowApi.setStickySettings({ alwaysOnTop: false });
  expect(invoke).toHaveBeenLastCalledWith("set_sticky_settings", {
    settings: { alwaysOnTop: false },
  });
});
```

- [ ] **Step 2: Run the focused frontend test and confirm RED**

Run: `pnpm vitest run src/tests/window-api.test.ts`

Expected: `enterStickyMode`/`enterMainMode` are missing and old `showSticky` still exists.

- [ ] **Step 3: Write failing main-window transition tests**

In `src/tests/main-window.test.ts`, mock `promptApi`/`categoryApi` load calls with empty successful data, install a real `createPinia()`, and stub heavy child dialogs. Give all three buttons stable selectors in the intended implementation:

```ts
for (const selector of [
  "[data-test='sidebar-sticky-mode']",
  "[data-test='toolbar-sticky-mode']",
  "[data-test='pinned-sticky-mode']",
]) {
  await wrapper.get(selector).trigger("click");
  await flushPromises();
}
expect(windowApi.enterStickyMode).toHaveBeenCalledTimes(3);
```

Seed one pinned prompt so the pinned-panel control exists. Add a rejection test:

```ts
windowApi.enterStickyMode.mockRejectedValueOnce(new Error("native failure"));
await wrapper.get("[data-test='toolbar-sticky-mode']").trigger("click");
await flushPromises();
expect(wrapper.get("[aria-live='polite']").text()).toContain("无法切换到便签模式");
```

Also assert controls are disabled while one deferred command is pending and a second click does not issue a second request.

- [ ] **Step 4: Implement the typed API and narrow patch type**

Add:

```ts
export type WindowModeResult = { mode: "main" | "sticky" };
export type StickySettingsPatch = { alwaysOnTop?: boolean };
```

Change `windowApi`:

```ts
enterStickyMode: () => invoke<{ mode: "sticky" }>("enter_sticky_mode"),
enterMainMode: () => invoke<{ mode: "main" }>("enter_main_mode"),
hideSticky: () => invoke<{ hidden: true }>("hide_sticky_window"),
setStickySettings: (settings: StickySettingsPatch) =>
  invoke<StickySettings>("set_sticky_settings", { settings }),
```

Remove `showSticky` completely in the same working change that migrates all three call sites below; there is no intermediate commit with a broken TypeScript build.

- [ ] **Step 5: Extend sticky-window tests before implementation**

Expose/import the mocked `windowApi`, then add:

```ts
it("switches to full mode from the title icon and footer", async () => {
  const wrapper = mount(StickyWindow);
  await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
  await wrapper.get("[data-test='manage-in-main']").trigger("click");
  expect(windowApi.enterMainMode).toHaveBeenCalledTimes(2);
});

it("keeps close as the explicit zero-window action", async () => {
  await wrapper.get("[aria-label='收起便签']").trigger("click");
  expect(windowApi.hideSticky).toHaveBeenCalledOnce();
  expect(windowApi.enterMainMode).not.toHaveBeenCalled();
});
```

Add rejection/pending assertions parallel to the main-window tests and preserve the existing five-slot assertion.

- [ ] **Step 6: Run the three focused suites and confirm RED**

Run: `pnpm vitest run src/tests/window-api.test.ts src/tests/main-window.test.ts src/tests/sticky-window.test.ts`

Expected: missing IPC methods/selectors and inert sticky management actions fail.

- [ ] **Step 7: Implement one guarded handler per window**

In `MainWindow.vue`:

```ts
const switchingMode = ref(false);

async function enterStickyMode(): Promise<void> {
  if (switchingMode.value) return;
  switchingMode.value = true;
  try {
    await windowApi.enterStickyMode();
  } catch {
    notify("无法切换到便签模式", "error");
  } finally {
    switchingMode.value = false;
  }
}
```

Use it for sidebar, toolbar, and pinned-panel actions; add the three test selectors and `:disabled="switchingMode"`.

In `StickyWindow.vue`, add a matching `enterMainMode` handler with local pending state and accessible error feedback. Both the new header control and footer call it. The close handler catches `hideSticky` rejection and never calls `enterMainMode`.

Render an inline `aria-live="polite"` status in sticky mode for failures. Do not use an un-awaited inline promise in any mode button.

- [ ] **Step 8: Replace the inert glyph with an accessible outlined full-window icon**

Use a local inline SVG so the app stays offline and no icon dependency is added:

```html
<button
  data-test="enter-main-mode"
  title="切换到完整模式"
  aria-label="切换到完整模式"
  :disabled="switchingMode"
  @click="enterMainMode"
>
  <svg class="mode-window-icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2.5" y="3" width="11" height="9.5" rx="1.5" />
    <path d="M3 5.5h10" />
  </svg>
</button>
```

Wire the footer button with `data-test="manage-in-main"`. Add only compact SVG stroke/disabled/error styles to `global.css`; do not change sticky dimensions, five-row layout, yellow theme, dragging, or always-on-top button.

- [ ] **Step 9: Run focused tests, all frontend tests, and typecheck**

```bash
pnpm vitest run src/tests/window-api.test.ts src/tests/main-window.test.ts src/tests/sticky-window.test.ts
pnpm test:run
pnpm typecheck
pnpm format:check
```

Expected: all frontend tests pass, old `showSticky` references are gone, and there are no unhandled-rejection warnings.

- [ ] **Step 10: Commit the complete, buildable frontend migration**

```bash
git add src/tests/window-api.test.ts src/tests/main-window.test.ts src/tests/sticky-window.test.ts src/api/commands.ts src/types/runtime.ts src/windows/MainWindow.vue src/windows/StickyWindow.vue src/styles/global.css
git commit -m "feat: add exclusive full and sticky mode controls"
```

### Task 6: Run full verification and native macOS acceptance

**Files:**
- Generate: `src-tauri/target/release/bundle/macos/PromptDock.app`
- Record temporary evidence outside the repository until final artifacts are stable.

Use @verification-before-completion before making any completion claim.

- [ ] **Step 1: Prove no direct visibility or old API bypass remains**

Run:

```bash
rg -n "showSticky|show_sticky_window|visible: Option<bool>|settings\.visible\s*=|\.show\(\)|\.hide\(\)" src src-tauri/src
```

Expected: `settings.visible` writes and main/sticky show/hide calls exist only inside the transition coordinator/explicit close; quick-window show/hide remains allowed. Inspect every match.

- [ ] **Step 2: Run every automated gate from a clean process**

```bash
pnpm format:check
pnpm typecheck
pnpm test:run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
git diff --check
```

Expected: every command exits 0. Record exact Vitest file/test counts, Rust test count, Vite asset sizes, and any environment-only rerun in a temporary verification note; final testing documents are updated only after the DMG/archive artifacts are stable.

- [ ] **Step 3: Build and ad-hoc sign the native application**

Run:

```bash
pnpm tauri build --bundles app
codesign --force --deep --sign - src-tauri/target/release/bundle/macos/PromptDock.app
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/PromptDock.app
```

Expected: arm64 `.app` build and strict on-disk verification pass. If signing changes the bundle, do not reuse the old DMG.

- [ ] **Step 4: Execute the native acceptance matrix**

Launch the packaged `.app` and record PASS/FAIL/NOT_TESTED for each actually observed scenario:

1. Copy multiline Chinese/special-character text from another app; paste with `Cmd+V` into prompt title, tags, description, and body.
2. Verify `Cmd+A`, `Cmd+C`, `Cmd+X`, `Cmd+Z`, and `Shift+Cmd+Z` in a focused field.
3. Switch from all three main-window sticky entry points; only sticky remains visible.
4. Switch back through the header icon and footer; only main remains visible/focused.
5. Exercise app-menu open-main/toggle and second-instance activation.
6. Explicitly close sticky; verify neither product window opens automatically, then recover through app menu/Dock.
7. Rapidly alternate switches and relaunch once with each persisted mode.
8. Confirm sticky stays 340×270 and preserves always-on-top/position/five slots.

Never upgrade an unobserved scenario to PASS merely because unit tests pass; label it `NOT_TESTED` with the available automated evidence. Keep these observations in the temporary verification note for Task 7.

### Task 7: Regenerate, document, verify, and publish user-facing artifacts

**Files:**
- Replace: `src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg`
- Replace: `/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs/PromptDock_1.1.0_aarch64.dmg`
- Replace: `/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs/PromptDock_1.1.0_aarch64_app.zip`
- Replace: `/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs/PromptDock-V1.1-source.zip`
- Replace: `/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs/SHA256SUMS.txt`
- Replace: copied reports/README in the same `outputs` directory
- Modify: `docs/testing/test-report.md`
- Modify: `docs/testing/acceptance-report.md`
- Modify: `docs/testing/known-issues.md`
- Modify: `README.md`
- Create: `.gitattributes`

- [ ] **Step 1: Package the exact accepted signed app directly with `hdiutil`**

Do not invoke `pnpm tauri build` again here: Task 6 already built, signed, strictly verified, and exercised the release candidate. Use one deterministic, absolute temporary path and require it not to exist before starting. Every later command block redeclares this same path so it is safe across separate shell calls.

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
DMG_ROOT="$RELEASE_TMP/dmg-root"
RW_DMG="$RELEASE_TMP/PromptDock.rw.dmg"
FINAL_DMG="/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg"
test ! -e "$RELEASE_TMP"
mkdir -p "$RELEASE_TMP" "$DMG_ROOT"
mkdir -p "$(dirname "$FINAL_DMG")"
ditto "/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app" "$DMG_ROOT/PromptDock.app"
ln -s /Applications "$DMG_ROOT/Applications"
hdiutil create -ov -fs HFS+ -volname "PromptDock" -srcfolder "$DMG_ROOT" -format UDRW "$RW_DMG"
hdiutil convert "$RW_DMG" -ov -format UDZO -imagekey zlib-level=9 -o "$FINAL_DMG"
```

If the deterministic temporary path already exists, inspect and preserve it as evidence of the earlier attempt, select a new explicit suffixed path, and update that literal in every remaining command block before continuing. Do not clean `RELEASE_TMP` until all checks below pass. The final image must come from the just-signed app and contain exactly the application plus `/Applications` link (cosmetic hidden Finder files are allowed).

- [ ] **Step 2: Verify the image contents and mounted application**

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
FINAL_DMG="/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg"
MOUNT_DIR="$RELEASE_TMP/mount"
test -d "$RELEASE_TMP"
mkdir -p "$MOUNT_DIR"
hdiutil verify "$FINAL_DMG"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_DIR" "$FINAL_DMG"
find "$MOUNT_DIR" -maxdepth 1 -mindepth 1 -print
codesign --verify --deep --strict --verbose=2 "$MOUNT_DIR/PromptDock.app"
hdiutil detach "$MOUNT_DIR"
```

Expected: image verification passes, top-level contents include `PromptDock.app` and `Applications`, the mounted app's signature passes, and detach succeeds.

- [ ] **Step 3: Create and independently verify the signed app archive**

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
APP_ZIP="$RELEASE_TMP/PromptDock_1.1.0_aarch64_app.zip"
APP_EXTRACT="$RELEASE_TMP/app-extract"
test -d "$RELEASE_TMP"
ditto -c -k --sequesterRsrc --keepParent "/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app" "$APP_ZIP"
unzip -t "$APP_ZIP"
mkdir -p "$APP_EXTRACT"
ditto -x -k "$APP_ZIP" "$APP_EXTRACT"
codesign --verify --deep --strict --verbose=2 "$APP_EXTRACT/PromptDock.app"
```

Expected: ZIP integrity passes and the independently extracted application retains a valid deep signature.

- [ ] **Step 4: Update final verification documentation and commit it before source archiving**

Using the temporary evidence, update the three testing documents with exact automated counts, native observations, menu/transition coverage, final app/DMG verification, and any unresolved `UNVERIFIED_MACOS_RUNTIME` item. Update `README.md` so usage describes native Edit shortcuts and that entering sticky/full mode hides the other product window. Add `/.vscode export-ignore` to `.gitattributes` so the one tracked editor-metadata directory is omitted by `git archive`. Artifact hashes may be recorded for the stable app/DMG/app ZIP, but do not embed the source ZIP's self-referential hash in a tracked document.

```bash
set -euo pipefail
git add .gitattributes README.md docs/testing/test-report.md docs/testing/acceptance-report.md docs/testing/known-issues.md
git commit -m "docs: record window mode verification"
```

Expected: the commit changes only final documentation/README/archive metadata; application source remains identical to the code that produced the signed app.

- [ ] **Step 5: Create and inspect the source archive from committed `HEAD`**

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
SOURCE_ZIP="$RELEASE_TMP/PromptDock-V1.1-source.zip"
test -d "$RELEASE_TMP"
git -C /Users/qianduoduo/Desktop/AI_app/PromptDock archive --format=zip --prefix=PromptDock-V1.1/ --output="$SOURCE_ZIP" HEAD
unzip -t "$SOURCE_ZIP"
unzip -Z1 "$SOURCE_ZIP"
```

Inspect the listing and assert it contains the new spec, plan, source, tests, and final verification documents, with no `.git`, `node_modules`, `dist`, `src-tauri/target`, editor metadata, runtime database, or unrelated untracked file. Because `git archive` reads committed `HEAD`, prohibited untracked/build paths cannot leak into the source ZIP.

- [ ] **Step 6: Stage the complete output directory and calculate checksums last**

Create a complete sibling replacement directory, copy the verified DMG, app ZIP, source ZIP, final README, and three final reports into it using the existing output filenames, then generate `SHA256SUMS.txt` only after those copies are final:

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
FINAL_DMG="/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg"
OUTPUT_PARENT="/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev"
NEXT_OUTPUTS="$OUTPUT_PARENT/outputs.next-window-modes"
test -d "$RELEASE_TMP"
test ! -e "$NEXT_OUTPUTS"
mkdir -p "$NEXT_OUTPUTS"
ditto "$FINAL_DMG" "$NEXT_OUTPUTS/PromptDock_1.1.0_aarch64.dmg"
ditto "$RELEASE_TMP/PromptDock_1.1.0_aarch64_app.zip" "$NEXT_OUTPUTS/PromptDock_1.1.0_aarch64_app.zip"
ditto "$RELEASE_TMP/PromptDock-V1.1-source.zip" "$NEXT_OUTPUTS/PromptDock-V1.1-source.zip"
ditto "/Users/qianduoduo/Desktop/AI_app/PromptDock/docs/testing/acceptance-report.md" "$NEXT_OUTPUTS/PromptDock-V1.1-acceptance-report.md"
ditto "/Users/qianduoduo/Desktop/AI_app/PromptDock/docs/testing/known-issues.md" "$NEXT_OUTPUTS/PromptDock-V1.1-known-issues.md"
ditto "/Users/qianduoduo/Desktop/AI_app/PromptDock/docs/testing/test-report.md" "$NEXT_OUTPUTS/PromptDock-V1.1-test-report.md"
ditto "/Users/qianduoduo/Desktop/AI_app/PromptDock/README.md" "$NEXT_OUTPUTS/README-PromptDock.md"
cd "$NEXT_OUTPUTS"
shasum -a 256 PromptDock_1.1.0_aarch64.dmg PromptDock_1.1.0_aarch64_app.zip PromptDock-V1.1-source.zip PromptDock-V1.1-acceptance-report.md PromptDock-V1.1-known-issues.md PromptDock-V1.1-test-report.md README-PromptDock.md > SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
```

Expected: all seven staged files validate. Do not modify the current published `outputs` directory until this complete sibling validates.

- [ ] **Step 7: Publish with a recoverable directory swap**

```bash
set -euo pipefail
OUTPUT_PARENT="/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev"
CURRENT_OUTPUTS="$OUTPUT_PARENT/outputs"
NEXT_OUTPUTS="$OUTPUT_PARENT/outputs.next-window-modes"
PREVIOUS_OUTPUTS="$OUTPUT_PARENT/outputs.previous-window-modes"
test -d "$CURRENT_OUTPUTS"
test -d "$NEXT_OUTPUTS"
test ! -e "$PREVIOUS_OUTPUTS"
mv "$CURRENT_OUTPUTS" "$PREVIOUS_OUTPUTS"
if ! mv "$NEXT_OUTPUTS" "$CURRENT_OUTPUTS"; then
  mv "$PREVIOUS_OUTPUTS" "$CURRENT_OUTPUTS"
  exit 1
fi
```

This publishes all files together. Keep `outputs.previous-window-modes` as a recoverable prior release until the final audit succeeds; do not delete it during this task.

- [ ] **Step 8: Perform final repository and all-archive audit**

Run:

```bash
set -euo pipefail
RELEASE_TMP="/private/tmp/promptdock-window-mode-release-2026-10-14"
OUTPUTS="/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs"
PREVIOUS_OUTPUTS="/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs.previous-window-modes"
FAILED_OUTPUTS="/Users/qianduoduo/Documents/Codex/2026-10-13/users-qianduoduo-downloads-promptdock-macos-dev/outputs.failed-window-modes"
rollback_published_outputs() {
  if [[ -d "$PREVIOUS_OUTPUTS" && -d "$OUTPUTS" && ! -e "$FAILED_OUTPUTS" ]]; then
    mv "$OUTPUTS" "$FAILED_OUTPUTS"
    mv "$PREVIOUS_OUTPUTS" "$OUTPUTS"
  fi
}
trap rollback_published_outputs ERR
git -C /Users/qianduoduo/Desktop/AI_app/PromptDock status --short --branch
git -C /Users/qianduoduo/Desktop/AI_app/PromptDock log --oneline -8
cd "$OUTPUTS"
shasum -a 256 -c SHA256SUMS.txt
unzip -t PromptDock_1.1.0_aarch64_app.zip
unzip -t PromptDock-V1.1-source.zip
FINAL_EXTRACT="$RELEASE_TMP/final-published-app"
mkdir -p "$FINAL_EXTRACT"
ditto -x -k PromptDock_1.1.0_aarch64_app.zip "$FINAL_EXTRACT"
codesign --verify --deep --strict --verbose=2 "$FINAL_EXTRACT/PromptDock.app"
if unzip -Z1 PromptDock-V1.1-source.zip | rg -q '(^|/)(\.git|node_modules|dist|target|\.vscode|.*\.sqlite3)(/|$)'; then
  echo "Source archive contains a prohibited path" >&2
  rollback_published_outputs
  exit 1
fi
trap - ERR
```

The `ERR` trap moves a failed publication to `outputs.failed-window-modes` and restores `outputs.previous-window-modes` automatically before stopping. Expected: branch remains `feat/promptdock-macos-v1.1`, source changes are committed, both archives are readable, the extracted app is signed correctly, source exclusions hold, checksums pass from the output directory, and nothing was pushed, merged, rebased, or reset. Remove only the exact `RELEASE_TMP` directory after all evidence has been recorded; preserve it if a check fails.

