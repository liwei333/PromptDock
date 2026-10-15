# Sticky Window Control Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify PromptDock’s sticky window by replacing the settings dialog with a one-click comfortable/compact density control, removing duplicate general-management actions, and making the remaining Sort action reliably open the main window’s sticky manager.

**Architecture:** Keep density persistence on the existing typed sticky-settings IPC, but expose it directly through a dynamic `PdIconButton`. Add a one-slot, process-local `MainIntent` guarded by an async mutex so the sticky window can request `manage-sticky` before switching windows and the main window can consume it safely after the transition commits. The main window consumes on mount/focus, queues the manager behind any existing modal, and never uses `localStorage` or a second data source.

**Tech Stack:** Vue 3 Composition API, TypeScript 6, Vitest + Vue Test Utils, Tauri 2, Rust 2024, Tokio synchronization, SQLite-backed existing services, Lucide Vue icons.

---

## Scope and file map

This is one cohesive window-navigation/UI change rather than several independent subprojects. The files are split by responsibility:

- `src/types/runtime.ts` — shared frontend types for `MainIntent` and sticky runtime settings.
- `src/api/commands.ts` — exact Tauri invoke contract for optional main-window intent and atomic intent consumption.
- `src/tests/window-api.test.ts` — frontend IPC argument/name regression tests.
- `src-tauri/src/state.rs` — process-local, non-persistent pending main intent guarded by `tokio::sync::Mutex`.
- `src-tauri/src/commands/windows.rs` — typed intent consumption, serialized transition helper, and Tauri commands.
- `src-tauri/src/lib.rs` — registers `take_main_intent` with Tauri.
- `src-tauri/src/tests/window_mode_tests.rs` — deterministic success/failure concurrency tests using the existing fake window runtime and write gate.
- `src/windows/StickyWindow.vue` — direct density control, safe settings initialization, removal of redundant controls/dialog, and explicit Sort intent.
- `src/tests/sticky-window.test.ts` — direct density, accessibility, failure, unmount, and navigation tests.
- `src/windows/MainWindow.vue` — consumes pending intent on mount/focus, prevents duplicate drains, and queues the manager behind existing modal work.
- `src/tests/main-window.test.ts` — mount/focus delivery, retry, modal queue, idempotency, and cleanup tests.
- `src/styles/global.css` — removes obsolete sticky-settings dialog CSS only.
- `docs/product/PRD.md` — product truth for two densities and direct Sort behavior.
- `docs/product/UI_DESIGN_SPEC.md` — final sticky control/layout specification.
- `docs/product/TECH_ARCHITECTURE.md` — two-size Tauri configuration and typed intent/settings IPC contract.

No database migration, new dependency, remote API, `localStorage`, or change to `StickyManagerDialog` business behavior is allowed.

## Invariants to preserve throughout

- `sticky` remains a third independent Tauri Webview window using the same SQLite-backed prompt service.
- Density defaults to `comfortable` at 420×695; `compact` remains 340×270; arbitrary resize remains disabled.
- Copy, template routing, five-slot order, pin limits, drag region, always-on-top persistence, and hide behavior remain unchanged.
- Only the Sort action passes `manage-sticky`; the titlebar full-window button and empty slots use ordinary `enterMainMode()`.
- A failed window transition must never leak a consumable manager intent.
- Existing user work in an editor/import/category/runtime/quick overlay is never discarded to satisfy a Sort request.
- Keep the user-owned untracked `.superpowers/` directory untouched.

---

### Task 1: Define the typed frontend main-intent IPC contract

**Skills:** `@test-driven-development`

**Files:**

- Modify: `src/tests/window-api.test.ts:1-60`
- Modify: `src/types/runtime.ts:1-30`
- Modify: `src/api/commands.ts:1-75`

- [ ] **Step 1: Add failing API contract tests**

Extend `src/tests/window-api.test.ts` so ordinary navigation keeps the existing no-argument command, Sort sends only the typed intent, and the consumer maps to the exact new command name:

```ts
it("sends the sticky-manager intent only for task-specific main navigation", async () => {
  invoke.mockResolvedValueOnce({ mode: "main" });

  await expect(windowApi.enterMainMode("manage-sticky")).resolves.toEqual({
    mode: "main",
  });
  expect(invoke).toHaveBeenLastCalledWith("enter_main_mode", {
    intent: "manage-sticky",
  });
});

it("takes a pending main intent through its exact IPC command", async () => {
  invoke.mockResolvedValueOnce("manage-sticky");

  await expect(windowApi.takeMainIntent()).resolves.toBe("manage-sticky");
  expect(invoke).toHaveBeenLastCalledWith("take_main_intent");
});
```

Keep the existing assertion that `windowApi.enterMainMode()` calls `invoke("enter_main_mode")` without an argument object.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run src/tests/window-api.test.ts
```

Expected: FAIL because `enterMainMode` accepts no intent and `takeMainIntent` does not exist.

- [ ] **Step 3: Add the minimal runtime type and conditional invoke mapping**

Add to `src/types/runtime.ts`:

```ts
export type MainIntent = "manage-sticky";
```

Import it into `src/api/commands.ts` and implement:

```ts
enterMainMode: (intent?: MainIntent) =>
  intent
    ? invoke<{ mode: "main" }>("enter_main_mode", { intent })
    : invoke<{ mode: "main" }>("enter_main_mode"),
takeMainIntent: () => invoke<MainIntent | null>("take_main_intent"),
```

Do not send `{ intent: undefined }`; retaining the exact no-argument invocation protects current callers and tests.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run src/tests/window-api.test.ts
```

Expected: PASS, including the old exclusive-mode mapping test and both new intent tests.

- [ ] **Step 5: Commit the frontend contract**

```bash
git add src/types/runtime.ts src/api/commands.ts src/tests/window-api.test.ts
git commit -m "feat: add typed main window intent API"
```

---

### Task 2: Implement a race-safe one-shot main intent in Rust

**Skills:** `@test-driven-development`

**Files:**

- Modify: `src-tauri/src/state.rs:1-85`
- Modify: `src-tauri/src/commands/windows.rs:1-285`
- Modify: `src-tauri/src/lib.rs:172-202`
- Modify: `src-tauri/src/tests/window_mode_tests.rs:1-1100`

- [ ] **Step 1: Write failing serialization and concurrency tests**

Expose testable crate-level helpers from `commands/windows.rs` and import them into `src-tauri/src/tests/window_mode_tests.rs`:

```rust
use crate::{
    commands::windows::{
        StickyDensity, StickySettings, take_main_intent_value,
        transition_to_main_with_intent,
    },
    state::MainIntent,
    // existing imports stay
};
```

Add a successful concurrency test using the existing `FakeRuntime::pause_next_write()` gate:

```rust
#[tokio::test]
async fn main_intent_waits_until_the_window_transition_commits() {
    let runtime = FakeRuntime::new(false, true, true);
    let mode_transition = AsyncMutex::new(());
    let pending_intent = AsyncMutex::new(None);
    let gate = runtime.pause_next_write();

    let mut transition = Box::pin(transition_to_main_with_intent(
        &runtime,
        &mode_transition,
        &pending_intent,
        Some(MainIntent::ManageSticky),
    ));
    assert_pending(transition.as_mut()).await;
    gate.assert_entered().await;

    let mut take = Box::pin(take_main_intent_value(&pending_intent));
    assert_pending(take.as_mut()).await;

    gate.release.notify_one();
    transition.await.unwrap();
    assert_eq!(take.await, Some(MainIntent::ManageSticky));
    assert_eq!(take_main_intent_value(&pending_intent).await, None);
}
```

Add the rollback race using an injected persistence failure:

```rust
#[tokio::test]
async fn failed_main_transition_clears_intent_before_a_waiting_take_continues() {
    let runtime = FakeRuntime::new(false, true, true);
    runtime.fail(
        "persist_visible_false",
        FailureTiming::After,
        native_failure(),
    );
    let mode_transition = AsyncMutex::new(());
    let pending_intent = AsyncMutex::new(None);
    let gate = runtime.pause_next_write();

    let mut transition = Box::pin(transition_to_main_with_intent(
        &runtime,
        &mode_transition,
        &pending_intent,
        Some(MainIntent::ManageSticky),
    ));
    assert_pending(transition.as_mut()).await;
    gate.assert_entered().await;

    let mut take = Box::pin(take_main_intent_value(&pending_intent));
    assert_pending(take.as_mut()).await;

    gate.release.notify_one();
    assert!(transition.await.is_err());
    assert_eq!(take.await, None);
}
```

Also add focused assertions that:

- `MainIntent::ManageSticky` serializes to `"manage-sticky"` and rejects unknown strings.
- An ordinary `transition_to_main_with_intent(..., None)` neither creates nor clears an already pending retry intent.
- A successfully consumed intent is returned exactly once.

- [ ] **Step 2: Run the Rust intent tests and verify RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml main_intent -- --nocapture
```

Expected: compilation/test failure because `MainIntent`, the pending field, and both helpers do not exist.

- [ ] **Step 3: Add the process-local intent state**

In `src-tauri/src/state.rs`, extend the existing serde import and define the enum near the other runtime state types:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MainIntent {
    ManageSticky,
}
```

Add the single-slot async state to `AppState` and initialize it empty:

```rust
pub pending_main_intent: Arc<tokio::sync::Mutex<Option<MainIntent>>>,
```

```rust
pending_main_intent: Arc::new(tokio::sync::Mutex::new(None)),
```

This state is process-local only. Do not persist it to SQLite, settings JSON, or `localStorage`.

- [ ] **Step 4: Implement the shared lock ordering and atomic consumer**

In `src-tauri/src/commands/windows.rs`, import `MainIntent` and add:

```rust
pub(crate) async fn transition_to_main_with_intent(
    runtime: &impl WindowModeRuntime,
    mode_transition: &tokio::sync::Mutex<()>,
    pending_main_intent: &tokio::sync::Mutex<Option<MainIntent>>,
    intent: Option<MainIntent>,
) -> Result<(), AppError> {
    let Some(intent) = intent else {
        return transition_to(runtime, mode_transition, WindowMode::Main).await;
    };

    // Lock order is always pending_main_intent -> mode_transition.
    let mut pending = pending_main_intent.lock().await;
    *pending = Some(intent);
    match transition_to(runtime, mode_transition, WindowMode::Main).await {
        Ok(()) => Ok(()),
        Err(error) => {
            *pending = None;
            Err(error)
        }
    }
}

pub(crate) async fn take_main_intent_value(
    pending_main_intent: &tokio::sync::Mutex<Option<MainIntent>>,
) -> Option<MainIntent> {
    pending_main_intent.lock().await.take()
}
```

Then change and add the Tauri commands:

```rust
#[tauri::command]
pub async fn enter_main_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    intent: Option<MainIntent>,
) -> CommandResult<ModeResult> {
    let runtime = TauriWindowModeRuntime::new(app, state.inner().clone());
    transition_to_main_with_intent(
        &runtime,
        &state.mode_transition,
        &state.pending_main_intent,
        intent,
    )
    .await?;
    Ok(ModeResult {
        mode: WindowMode::Main,
    })
}

#[tauri::command]
pub async fn take_main_intent(state: State<'_, AppState>) -> Option<MainIntent> {
    take_main_intent_value(&state.pending_main_intent).await
}
```

Do not acquire `pending_main_intent` while already holding `mode_transition`; that would reverse the documented order and make deadlock possible.

- [ ] **Step 5: Register the consumer command**

Add `windows::take_main_intent` immediately after `windows::enter_main_mode` in the `tauri::generate_handler!` list in `src-tauri/src/lib.rs`.

- [ ] **Step 6: Run focused Rust tests and verify GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml main_intent -- --nocapture
```

Expected: all new serialization, success-race, failure-race, ordinary-navigation, and one-shot tests PASS.

- [ ] **Step 7: Run all native window-mode tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml window_mode -- --nocapture
```

Expected: existing exclusive-window, rollback, preference, and position serialization tests still PASS.

- [ ] **Step 8: Commit the native intent transaction**

```bash
git add src-tauri/src/state.rs src-tauri/src/commands/windows.rs src-tauri/src/lib.rs src-tauri/src/tests/window_mode_tests.rs
git commit -m "feat: preserve sticky manager navigation intent"
```

---

### Task 3: Replace sticky settings with the direct density control

**Skills:** `@test-driven-development`, `@ui-styling`

**Files:**

- Modify: `src/tests/sticky-window.test.ts:250-620,930-1025`
- Modify: `src/windows/StickyWindow.vue:1-530`
- Modify: `src/styles/global.css:2615-2667,2792-2814`

- [ ] **Step 1: Rewrite old dialog tests as direct-control tests**

Delete tests that assert settings-dialog focus restoration or dismissal guards. Update density tests to call `enableTauri()`, mount the sticky window, wait for settings initialization, and select the titlebar button directly:

```ts
const densityToggle = () =>
  wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");
```

Add/adjust tests covering all of the following:

```ts
it("toggles directly between comfortable and compact density", async () => {
  enableTauri();
  windowApi.setStickySettings
    .mockResolvedValueOnce({
      ...defaultStickySettings,
      density: "compact",
    })
    .mockResolvedValueOnce({
      ...defaultStickySettings,
      density: "comfortable",
    });
  const wrapper = mountSticky();
  await flushPromises();

  const toggle = wrapper.get("[data-test='sticky-density-toggle']");
  expect(toggle.attributes("aria-label")).toBe("切换到精简模式");
  expect(toggle.find(".lucide-shrink").exists()).toBe(true);
  await toggle.trigger("click");
  await flushPromises();
  expect(windowApi.setStickySettings).toHaveBeenLastCalledWith({
    density: "compact",
  });
  expect(toggle.attributes("aria-label")).toBe("切换到舒适模式");
  expect(toggle.find(".lucide-expand").exists()).toBe(true);

  await toggle.trigger("click");
  await flushPromises();
  expect(windowApi.setStickySettings).toHaveBeenLastCalledWith({
    density: "comfortable",
  });
});
```

Use the existing settings object literal or introduce a test-only `defaultStickySettings` constant to avoid repeating all position fields.

Add separate tests for:

- Pending initial read disables density and always-on-top, while full-mode and hide remain enabled.
- Failed initial read keeps density and always-on-top disabled and calls no settings mutation.
- Pending density change sets `disabled` and `aria-busy="true"`; repeated clicks issue one IPC.
- Failed density change leaves `comfortable`, clears busy, and announces “无法调整便签尺寸”.
- A response after unmount cannot update density or produce feedback.
- The backend-returned density, rather than the requested value, is the final UI truth.
- Tooltip text follows the same dynamic target label in both modes.
- The DOM has no `sticky-menu`, settings `role="dialog"`, `manage-in-main`, or “打开完整窗口”.
- Compact footer contains “排序” and “始终置顶” but not “管理”.
- Title full-mode invokes `enterMainMode()` with no intent; Sort invokes `enterMainMode("manage-sticky")`.
- Full-mode and Sort share the current pending guard so cross-clicking produces only one IPC.

- [ ] **Step 2: Run sticky tests and verify RED**

Run:

```bash
pnpm vitest run src/tests/sticky-window.test.ts
```

Expected: FAIL because the old gear/dialog/manage controls are still rendered and no direct titlebar density behavior exists.

- [ ] **Step 3: Implement safe settings readiness and the dynamic density button**

In `src/windows/StickyWindow.vue`:

- Replace `Settings` with `Shrink` and `Expand` imports.
- Remove `PdDialog`, `settingsOpen`, `dismissSettings`, and `guardSettingsDismiss`.
- Import `MainIntent` and add `settingsReady = ref(false)` plus a dynamic label:

```ts
const densityToggleLabel = computed(() =>
  density.value === "comfortable"
    ? "切换到精简模式"
    : "切换到舒适模式",
);
```

- Guard both setting mutations with readiness:

```ts
if (!settingsReady.value || settingsLoading.value || densityBusy.value) return;
```

Use the corresponding busy flag for always-on-top.

- Set readiness only inside the current successful initialization branch:

```ts
alwaysOnTop.value = settings.alwaysOnTop;
density.value = settings.density ?? "comfortable";
settingsReady.value = true;
```

On initialization failure, leave `settingsReady` false. Remove `settingsOpen.value = false` from density success.

- [ ] **Step 4: Render the simplified titlebar and footer**

Replace the gear button with:

```vue
<PdIconButton
  data-test="sticky-density-toggle"
  :label="densityToggleLabel"
  :icon="density === 'comfortable' ? Shrink : Expand"
  :disabled="!settingsReady || settingsLoading || densityBusy"
  :aria-busy="densityBusy ? 'true' : undefined"
  @click="toggleDensity"
/>
```

Make every ordinary mode call explicit so Vue never forwards a click event as an intent:

```vue
@click="enterMainMode()"
```

Change the function signature and Sort handler:

```ts
async function enterMainMode(intent?: MainIntent): Promise<void> {
  if (switchingMode.value) return;
  const request = ++mainModeRequest;
  switchingMode.value = true;
  windowError.value = "";
  try {
    await windowApi.enterMainMode(intent);
  } catch {
    if (!disposed && request === mainModeRequest) {
      windowError.value =
        intent === "manage-sticky"
          ? "无法打开置顶排序"
          : "无法切换到完整模式";
    }
  } finally {
    if (!disposed && request === mainModeRequest) switchingMode.value = false;
  }
}
```

```vue
<PdButton
  data-test="sort-in-main"
  size="sm"
  variant="ghost"
  :disabled="switchingMode"
  @click="enterMainMode('manage-sticky')"
>
  <template #leading><GripVertical aria-hidden="true" /></template>
  排序
</PdButton>
```

Delete the footer `manage-in-main` button and the complete `PdDialog` block. Update the always-on-top switch to disable on `!settingsReady` as well as loading/busy.

- [ ] **Step 5: Remove only obsolete dialog CSS**

Delete these selectors and their full rule bodies from `src/styles/global.css`:

```text
.sticky-settings-dialog
.sticky-settings-dialog .pd-dialog-header
.sticky-settings-dialog .pd-dialog-body
.sticky-setting-row
.sticky-setting-row > span
.sticky-setting-row strong
.sticky-setting-row small
.sticky-setting-row > .pd-button
.sticky-settings-dialog--compact
.sticky-settings-dialog--compact .pd-dialog-header
.sticky-settings-dialog--compact .pd-dialog-description
.sticky-settings-dialog--compact .pd-dialog-body
.sticky-settings-dialog--compact .sticky-setting-row
.sticky-settings-dialog--compact .sticky-setting-row > .pd-button
```

Do not alter shared `PdDialog`, `PdIconButton`, footer button, density layout, or paper-theme tokens.

- [ ] **Step 6: Run sticky tests and verify GREEN**

Run:

```bash
pnpm vitest run src/tests/sticky-window.test.ts
```

Expected: all sticky-window tests PASS with direct density switching and no old dialog/management entry.

- [ ] **Step 7: Run typecheck before committing**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no Vue template or `MainIntent` type errors.

- [ ] **Step 8: Commit the sticky-window simplification**

```bash
git add src/windows/StickyWindow.vue src/tests/sticky-window.test.ts src/styles/global.css
git commit -m "feat: simplify sticky window controls"
```

---

### Task 4: Consume manager intent safely in the main window

**Skills:** `@test-driven-development`

**Files:**

- Modify: `src/tests/main-window.test.ts:1-950`
- Modify: `src/windows/MainWindow.vue:1-390,480-540`

- [ ] **Step 1: Extend the main-window API mock and write failing delivery tests**

Add `takeMainIntent: vi.fn()` to the hoisted `windowApi` mock and default it to `null` in `beforeEach`:

```ts
windowApi.takeMainIntent.mockResolvedValue(null);
```

Add a helper in the test file to enable Tauri before mounting. Then add tests proving:

1. `takeMainIntent` is requested before a deferred initial `store.load()` resolves.
2. A returned `manage-sticky` intent mounts exactly one `StickyManagerDialog`.
3. Mount and focus triggers overlap while the first take is pending, but only one IPC is in flight.
4. A rejected take writes “无法打开置顶排序，请重试” to the stable main live region; the next focus retries and opens the manager.
5. After unmount, focus no longer calls `takeMainIntent` and late results do not mutate state.

Representative first-load test:

```ts
it("consumes sticky-manager intent before the initial store load settles", async () => {
  enableTauri();
  const promptList = deferred<{ items: never[]; total: number }>();
  promptApi.list.mockReturnValueOnce(promptList.promise);
  windowApi.takeMainIntent.mockResolvedValueOnce("manage-sticky");

  const wrapper = mount(MainWindow, {
    global: {
      plugins: [createPinia()],
      stubs: mainWindowStubs,
    },
  });
  await flushPromises();

  expect(windowApi.takeMainIntent).toHaveBeenCalledOnce();
  expect(wrapper.find("sticky-manager-dialog-stub").exists()).toBe(true);

  promptList.resolve({ items: [], total: 0 });
  await flushPromises();
  wrapper.unmount();
});
```

Extract the mount helper’s existing complete stub object into `mainWindowStubs` if needed; do not reduce test isolation by mounting unrelated real dialogs.

- [ ] **Step 2: Add failing modal-queue and idempotency tests**

Test the conflict policy through visible component state:

- Open an editor (or another existing modal), then return `manage-sticky` on a focus-triggered take.
- Assert the editor remains mounted, the manager is not mounted, and the live region says “关闭当前操作后将打开置顶排序”.
- Emit the editor’s normal `close`; assert the manager mounts afterward.
- While the manager is already mounted, return another `manage-sticky`; assert only one manager instance exists.
- Trigger multiple intents while blocked; assert they coalesce into a single later manager instance.

- [ ] **Step 3: Run the focused main-window tests and verify RED**

Run:

```bash
pnpm vitest run src/tests/main-window.test.ts
```

Expected: FAIL because `MainWindow` neither consumes intents nor queues modal navigation.

- [ ] **Step 4: Implement single-flight mount/focus intent consumption**

In `src/windows/MainWindow.vue`, import `watch` and add:

```ts
const queuedStickyManager = ref(false);
const mainIntentBusy = ref(false);
let mainIntentCheckQueued = false;

const hasBlockingSurface = computed(
  () =>
    editing.value !== undefined ||
    quickOpen.value ||
    importPreview.value !== null ||
    runtimeOpen.value ||
    categoryManagerOpen.value,
);
```

Implement a single-flight drain. Preserve these semantics even if local names change:

```ts
function openOrQueueStickyManager(): void {
  if (stickyManagerOpen.value) {
    queuedStickyManager.value = false;
    return;
  }
  if (hasBlockingSurface.value) {
    queuedStickyManager.value = true;
    notify("关闭当前操作后将打开置顶排序");
    return;
  }
  queuedStickyManager.value = false;
  stickyManagerOpen.value = true;
}

async function consumeMainIntent(): Promise<void> {
  if (disposed || !("__TAURI_INTERNALS__" in window)) return;
  if (mainIntentBusy.value) {
    mainIntentCheckQueued = true;
    return;
  }
  mainIntentBusy.value = true;
  try {
    do {
      mainIntentCheckQueued = false;
      try {
        const intent = await windowApi.takeMainIntent();
        if (disposed) return;
        if (intent === "manage-sticky") openOrQueueStickyManager();
      } catch {
        if (!disposed) notify("无法打开置顶排序，请重试", "error");
        break;
      }
    } while (!disposed && mainIntentCheckQueued);
  } finally {
    if (!disposed) mainIntentBusy.value = false;
  }
}

function handleMainFocus(): void {
  void consumeMainIntent();
}
```

- [ ] **Step 5: Queue behind current work and register before any await**

Add:

```ts
watch(hasBlockingSurface, (blocked) => {
  if (
    !disposed &&
    !blocked &&
    queuedStickyManager.value &&
    !stickyManagerOpen.value
  ) {
    queuedStickyManager.value = false;
    stickyManagerOpen.value = true;
  }
});
```

Restructure `onMounted` so listener registration and the initial consume happen before `store.load()` begins waiting:

```ts
onMounted(() => {
  window.addEventListener("keydown", keydown);
  window.addEventListener("focus", handleMainFocus);
  if ("__TAURI_INTERNALS__" in window) {
    void consumeMainIntent();
    void startPromptsListener();
  }
  void store.load();
});
```

Extract the existing `prompts-changed` registration into `startPromptsListener()` with the same late-registration unlisten protection already tested. In `onBeforeUnmount`, remove the focus listener and prevent late intent work from mutating UI.

Keep the status-bar “管理置顶” button functional. Route it through `openOrQueueStickyManager()` for the same modal-safety policy instead of assigning the ref directly.

- [ ] **Step 6: Run main-window tests and verify GREEN**

Run:

```bash
pnpm vitest run src/tests/main-window.test.ts
```

Expected: all existing workbench tests plus new intent delivery, retry, queue, idempotency, and cleanup tests PASS.

- [ ] **Step 7: Run the three affected frontend suites together**

Run:

```bash
pnpm vitest run src/tests/window-api.test.ts src/tests/sticky-window.test.ts src/tests/main-window.test.ts
```

Expected: PASS with no shared mock or focus-listener leakage between suites.

- [ ] **Step 8: Commit main-window intent consumption**

```bash
git add src/windows/MainWindow.vue src/tests/main-window.test.ts
git commit -m "feat: open sticky manager from sort intent"
```

---

### Task 5: Align PRD, UI specification, and technical architecture

**Files:**

- Modify: `docs/product/PRD.md:72,250-290`
- Modify: `docs/product/UI_DESIGN_SPEC.md:188-218`
- Modify: `docs/product/TECH_ARCHITECTURE.md:525-605`

- [ ] **Step 1: Update PRD product truth**

Make these explicit edits in `docs/product/PRD.md`:

- FR-17 summary: replace “独立 340×270 常驻便签” with two persisted density modes.
- FR-17.1: default is comfortable 420×695; compact is 340×270; no arbitrary resize.
- FR-17.1: titlebar contains density toggle, full-window action, and hide; footer contains Sort and always-on-top.
- FR-17.1: comfortable rows may show description/action context; compact rows remain title-only.
- FR-17.2: sticky Sort directly opens the main window’s “管理置顶” dialog and never changes order by copy count.
- AT-17: verify both exact logical sizes, bidirectional one-click switching, and restart persistence.
- AT-20: verify Sort opens the manager directly, order persists, and copying does not reorder.

- [ ] **Step 2: Update the UI design specification**

In `docs/product/UI_DESIGN_SPEC.md`:

- Replace fixed-only 340×270 with comfortable 420×695 default plus compact 340×270.
- Document the three titlebar buttons and their dynamic labels/icons.
- Document the comfortable versus compact row content.
- Replace the old bottom copy hint/management wording with Sort plus always-on-top.
- State that the settings dialog and generic footer Manage action do not exist.
- Keep the distinction between `quick` and `sticky`, but describe sticky as a five-slot, two-density controlled window.

- [ ] **Step 3: Update the technical architecture**

In `docs/product/TECH_ARCHITECTURE.md`:

- Update the window topology and Tauri configuration intent to 420×695 default with 340×270 min/compact and fixed discrete sizing.
- Add `density` to `get_sticky_settings`/`set_sticky_settings`, including default and allowed values.
- Add `enter_main_mode { intent?: "manage-sticky" }` and `take_main_intent` to the IPC contract table.
- Explain that the pending intent is an in-process, one-shot async-mutex slot, uses lock order `pending_main_intent -> mode_transition`, and is cleared before rollback errors return.
- Explain mount/focus consumption and modal queuing without claiming this state is persisted.
- Correct obsolete command names only where necessary to describe the implemented contract; do not rewrite unrelated architecture sections.

- [ ] **Step 4: Run document consistency searches**

Run:

```bash
rg -n "340×270|340 × 270|固定大小|管理按钮|管理置顶|便签设置|enter_main_mode|get_sticky_settings" docs/product/PRD.md docs/product/UI_DESIGN_SPEC.md docs/product/TECH_ARCHITECTURE.md
```

Expected: remaining 340×270 references identify compact mode, not the only/default size; no normative section requires the removed gear/dialog/footer Manage action; IPC references match the implemented command names and fields.

- [ ] **Step 5: Commit the product truth update**

```bash
git add docs/product/PRD.md docs/product/UI_DESIGN_SPEC.md docs/product/TECH_ARCHITECTURE.md
git commit -m "docs: align sticky window controls and density modes"
```

---

### Task 6: Full verification and native macOS acceptance

**Skills:** `@verification-before-completion`

**Files:**

- Verify only; do not modify unrelated files to silence failures.

- [ ] **Step 1: Check formatting without rewriting unrelated files**

Run:

```bash
pnpm exec prettier --check src/api/commands.ts src/types/runtime.ts src/windows/StickyWindow.vue src/windows/MainWindow.vue src/tests/window-api.test.ts src/tests/sticky-window.test.ts src/tests/main-window.test.ts
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check
```

Expected: all three commands exit 0. If formatting is needed, format only the files in this plan, review the diff, and amend the relevant task commit.

- [ ] **Step 2: Run all frontend tests**

Run:

```bash
pnpm test:run
```

Expected: every Vitest file passes; record the real file/test counts from output.

- [ ] **Step 3: Run frontend typecheck and production build**

Run:

```bash
pnpm build
```

Expected: `vue-tsc --noEmit` and Vite production build both exit 0.

- [ ] **Step 4: Run all Rust tests and lint**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: all native tests pass and Clippy reports no warnings.

- [ ] **Step 5: Build the native application bundle**

Run:

```bash
pnpm tauri build
```

Expected: exit 0 and a macOS `.app` is produced under `src-tauri/target/release/bundle/macos/`.

- [ ] **Step 6: Perform native macOS manual acceptance in the built `.app`**

Use real app data and the system clipboard; do not inject demo prompts. Record pass/fail evidence for:

1. Comfortable mode opens at approximately 420×695 and the density button says “切换到精简模式”.
2. One click changes to approximately 340×270, keeps all five slots usable, and changes the label/icon to “切换到舒适模式”.
3. One click returns to comfortable; quit/relaunch preserves the last selected density.
4. All three titlebar controls and footer controls remain visible in both sizes; tooltips and keyboard focus are not clipped.
5. Title full-window action opens the ordinary main workbench without opening the manager.
6. Footer Sort opens the main workbench directly with `StickyManagerDialog` visible.
7. With an editor/import/category/runtime/quick surface already open, Sort preserves it, announces the queued action, and opens the manager only after the original surface closes.
8. Repeated Sort/full-window clicks do not create duplicate dialogs or contradictory window states.
9. Always-on-top, hide, copy, template routing, prompt refresh, and drag behavior still work.
10. There is no settings gear/dialog, footer Manage action, automatic paste, network request, or extra permission prompt.

If the native app cannot be exercised, mark these items `UNVERIFIED_MACOS_RUNTIME`; do not describe them as passing.

- [ ] **Step 7: Inspect the final repository state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: only the known user-owned `.superpowers/` path may remain untracked; all files from this plan are committed on `feat/promptdock-ui-native-polish`; no push, merge, or rebase has occurred.

- [ ] **Step 8: Report with the project acceptance template**

Use the exact sections required by `AGENTS.md`:

```text
【阶段】
【Git 分支 / 最新提交 / 工作区状态】
【本阶段实现】
【实际变更文件】
【执行命令和结果】（真实命令、exit code、日志摘要）
【验收用例】（通过/失败/未验证；证据）
【实际数据路径】
【原生 macOS 测试】（是否在 Mac 上测试，没测必须明确）
【遗留缺陷】（P0/P1/P2）
【是否达到进入下一阶段的门槛】
```

Do not claim completion until all automated commands have fresh passing output and native-only claims are backed by actual `.app` interaction.
