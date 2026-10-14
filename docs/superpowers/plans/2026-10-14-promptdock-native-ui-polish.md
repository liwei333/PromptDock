# PromptDock Native UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PromptDock's raw HTML controls and Unicode glyph icons with a locally bundled, accessible, macOS-inspired component system while preserving every existing SQLite, clipboard, shortcut, backup, and native-window behavior.

**Architecture:** Add `reka-ui` and `lucide-vue-next`, then place a thin PromptDock-owned `Pd*` component layer between feature components and those libraries. Migrate the Main workbench, dialogs, Quick, and Sticky incrementally; business events continue flowing through existing Vue emits/stores and typed Rust commands. Keep shared Vue presentation platform-neutral, show platform-aware shortcut labels, and use the host OS's real decorated Main frame.

**Tech Stack:** Tauri 2, Vue 3, TypeScript 6, Pinia, Vite 8, Vitest 5, Vue Test Utils, Reka UI, Lucide Vue Next, Rust, SQLite.

**Design authority:** `docs/superpowers/specs/2026-10-14-promptdock-native-ui-polish-design.md`

**Required practices:** Use `@test-driven-development` for behavior changes, `@ui-styling` for token/component decisions, `@systematic-debugging` for unexpected failures, and `@verification-before-completion` before reporting completion.

---

## File structure and responsibilities

### New files

- `src/styles/tokens.css` — semantic colors, type, radius, shadow, spacing, control-height, and motion tokens.
- `src/ui/platform.ts` — injectable platform detection and shortcut display labels.
- `src/components/ui/PdButton.vue` — text button variants and loading state.
- `src/components/ui/PdIconButton.vue` — consistent icon-only metrics and accessible-name contract.
- `src/components/ui/PdTooltip.vue` — Reka Tooltip wrapper.
- `src/components/ui/PdSelect.vue` — Reka Select wrapper with typed options.
- `src/components/ui/PdDialog.vue` — Reka Dialog shell and dismiss contract.
- `src/components/ui/PdToggle.vue` — Reka Toggle-based boolean filter chip.
- `src/components/ui/PdSwitch.vue` — Reka Switch wrapper.
- `src/components/ui/PdBadge.vue` — low-emphasis metadata badge.
- `src/components/ui/PdStatusMessage.vue` — inline status feedback.
- `src/tests/ui-primitives.test.ts` — basic visual primitive contracts.
- `src/tests/ui-interactions.test.ts` — Select/Dialog/Toggle/Switch contracts.
- `src/tests/platform-ui.test.ts` — macOS/Windows shortcut labels.

### Existing files changed by responsibility

- `package.json`, `pnpm-lock.yaml` — lock the two approved dependencies.
- `src/main.ts`, `src/styles/global.css` — load and consume tokens; remove obsolete glyph/fake-traffic styling.
- `src/components/WorkbenchIconRail.vue`, `WorkbenchFilters.vue`, `DashboardStatCards.vue` — native-feeling workbench header controls.
- `src/components/PromptListPane.vue`, `PromptDetailPane.vue`, `src/windows/MainWindow.vue` — source list, reading surface, and status actions.
- `src/components/CategoryManagerDialog.vue`, `CategoryDeleteDialog.vue`, `CategoryCreateDialog.vue` — shared Dialog/Select/icon language without changing category transactions.
- `src/components/RuntimeInfoDialog.vue`, `ImportPreviewDialog.vue`, `PromptEditorDialog.vue`, `StickyManagerDialog.vue`, `TemplateVariablesPanel.vue` — shared overlay presentation; native Tauri confirmations/file dialogs remain native.
- `src/components/PromptCard.vue`, `PromptDetailDrawer.vue`, `QuickPalette.vue` — remove remaining control glyphs while preserving tested behavior.
- `src/windows/StickyWindow.vue` — functional Lucide titlebar/actions, PdSwitch, refined five-row paper surface, no fake traffic lights.
- Existing tests in `src/tests/` — retain behavior assertions while targeting roles, labels, and `data-test`, not SVG internals.
- `docs/testing/acceptance-report.md` — exact automated/native results and unverified boundaries.

No migration or Rust business-command file should change. If a step appears to require one, stop and re-check the approved design before expanding scope.

---

### Task 1: Lock the approved dependencies and record the baseline

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Reconfirm branch and preserve user changes**

Run:

```bash
pwd
git status --short --branch
git branch --show-current
git log -1 --oneline
```

Expected: branch is `feat/promptdock-ui-native-polish`; this reviewed plan is already committed, so only the existing user-owned `.superpowers/` path may be untracked. If the plan is still untracked, commit it before continuing rather than treating it as implementation output.

- [ ] **Step 2: Run the frontend baseline**

```bash
pnpm typecheck
pnpm vitest run
```

Expected: current baseline passes. Record exact file/test counts.

- [ ] **Step 3: Add exactly the two approved dependencies**

```bash
pnpm add reka-ui lucide-vue-next
```

Expected: only `package.json` and `pnpm-lock.yaml` change; no Tailwind, shadcn-vue, Element Plus, Ant Design Vue, icon CDN, or unrelated package is added. If registry access is blocked, request permission for this exact command instead of changing installers.

- [ ] **Step 4: Prove the locked dependencies resolve**

```bash
pnpm exec vue-tsc --noEmit
pnpm list reka-ui lucide-vue-next --depth 0
```

Expected: typecheck passes and both direct dependencies are listed.

- [ ] **Step 5: Commit the dependency boundary**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add accessible UI primitives"
```

---

### Task 2: Establish semantic tokens and presentation primitives

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/components/ui/PdButton.vue`
- Create: `src/components/ui/PdIconButton.vue`
- Create: `src/components/ui/PdTooltip.vue`
- Create: `src/components/ui/PdBadge.vue`
- Create: `src/components/ui/PdStatusMessage.vue`
- Create: `src/tests/ui-primitives.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing primitive tests**

Create `src/tests/ui-primitives.test.ts` with role/state assertions:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { AlertTriangle, Copy } from "lucide-vue-next";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";

describe("PromptDock UI primitives", () => {
  it("exposes variants, accessible icon names, and visible tooltips", async () => {
    const button = mount(PdButton, {
      props: { variant: "primary", disabled: true },
      slots: { default: "复制" },
    });
    expect(button.get("button").attributes("data-variant")).toBe("primary");
    expect(button.get("button").attributes()).toHaveProperty("disabled");
    const icon = mount(PdIconButton, {
      attachTo: document.body,
      props: { label: "复制提示词", icon: Copy },
    });
    expect(icon.get('button[aria-label="复制提示词"]')).toBeTruthy();
    await icon.get("button").trigger("focus");
    expect(document.body.textContent).toContain("复制提示词");
  });

  it("renders loading semantics, slots, and semantic status roles", () => {
    const loading = mount(PdButton, {
      props: { loading: true },
      slots: { leading: "before", default: "保存", trailing: "after" },
    });
    expect(loading.get("button").attributes("aria-busy")).toBe("true");
    expect(loading.get("button").attributes()).toHaveProperty("disabled");
    expect(loading.text()).toContain("before");
    expect(loading.text()).toContain("after");

    const wrapper = mount(PdStatusMessage, {
      props: { tone: "warning", icon: AlertTriangle, message: "变量格式无效" },
    });
    expect(wrapper.get('[role="status"]').text()).toContain("变量格式无效");
    expect(wrapper.get("svg").attributes("aria-hidden")).toBe("true");

    const error = mount(PdStatusMessage, {
      props: { tone: "danger", message: "复制失败", live: "assertive" },
    });
    expect(error.get('[role="alert"]').text()).toContain("复制失败");
  });
});
```

- [ ] **Step 2: Run it and verify the missing-component failure**

```bash
pnpm vitest run src/tests/ui-primitives.test.ts
```

Expected: FAIL because the `Pd*` files do not exist.

- [ ] **Step 3: Define the token contract**

Create `src/styles/tokens.css` with at least these semantic roles:

```css
:root {
  --pd-bg: #f4f5f7;
  --pd-surface: rgba(255, 255, 255, 0.88);
  --pd-surface-elevated: #ffffff;
  --pd-surface-hover: #f0f2f6;
  --pd-surface-selected: #e9edff;
  --pd-text: #1f2430;
  --pd-text-secondary: #687184;
  --pd-text-tertiary: #8d96a7;
  --pd-border: rgba(28, 36, 51, 0.1);
  --pd-border-strong: rgba(28, 36, 51, 0.16);
  --pd-accent: #5868d9;
  --pd-accent-hover: #4c5dcc;
  --pd-accent-soft: #e9edff;
  --pd-success: #228a66;
  --pd-warning: #b87318;
  --pd-danger: #c64a58;
  --pd-paper: #fff7c7;
  --pd-paper-border: #e6d986;
  --pd-radius-sm: 8px;
  --pd-radius-md: 10px;
  --pd-radius-lg: 12px;
  --pd-radius-xl: 14px;
  --pd-control-sm: 30px;
  --pd-control-md: 34px;
  --pd-shadow-popover: 0 12px 36px rgba(32, 40, 60, 0.16);
  --pd-motion-fast: 140ms;
}

@media (prefers-reduced-motion: reduce) {
  :root { --pd-motion-fast: 0ms; }
}
```

Import tokens before `global.css` in `src/main.ts`. Map existing legacy variables to semantic tokens instead of maintaining competing palettes.

- [ ] **Step 4: Implement the presentation primitive APIs**

Use these interfaces:

```ts
// PdButton
variant?: "primary" | "secondary" | "ghost" | "danger";
size?: "sm" | "md";
loading?: boolean;
disabled?: boolean;

// PdIconButton
label: string;
icon: Component;
tooltip?: string;
pressed?: boolean;
disabled?: boolean;

// PdBadge
tone?: "neutral" | "accent" | "success" | "warning";

// PdStatusMessage
tone: "info" | "success" | "warning" | "danger";
message: string;
icon?: Component;
live?: "off" | "polite" | "assertive";
```

`PdIconButton` always renders a visible `PdTooltip`; `tooltip` may override its copy, but when omitted the Tooltip text defaults to the required `label`. `PdTooltip` composes Reka `TooltipProvider`, `TooltipRoot`, `TooltipTrigger as-child`, `TooltipPortal`, and `TooltipContent`, uses zero delay in tests, opens on hover or keyboard focus, and leaves the caller's element focusable. Add an assertion that focusing/hovering the icon button makes `复制提示词` visible in the mounted document. Every later icon-only migration must use this contract; an `aria-label` without Tooltip content is not accepted.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm vitest run src/tests/ui-primitives.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add src/main.ts src/styles/tokens.css src/styles/global.css src/components/ui src/tests/ui-primitives.test.ts
git commit -m "feat: add PromptDock UI primitives"
```

---

### Task 3: Add Reka interaction wrappers

**Files:**
- Create: `src/components/ui/PdSelect.vue`
- Create: `src/components/ui/PdDialog.vue`
- Create: `src/components/ui/PdToggle.vue`
- Create: `src/components/ui/PdSwitch.vue`
- Create: `src/tests/ui-interactions.test.ts`
- Modify: `src/styles/global.css`
- Modify if required for real portals: `src/tests/setup.ts`

- [ ] **Step 1: Write failing public-contract tests**

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdSelect from "@/components/ui/PdSelect.vue";
import PdSwitch from "@/components/ui/PdSwitch.vue";
import PdToggle from "@/components/ui/PdToggle.vue";

const options = [
  { value: "recent", label: "最近更新" },
  { value: "popular", label: "最常使用" },
];

describe("PromptDock interaction wrappers", () => {
  it("emits selected and binary values", async () => {
    const select = mount(PdSelect, {
      attachTo: document.body,
      props: { modelValue: "recent", label: "排序", options },
    });
    await select.get('[aria-label="排序"]').trigger("click");
    document.querySelectorAll<HTMLElement>('[role="option"]')[1].click();
    expect(select.emitted("update:modelValue")?.at(-1)).toEqual(["popular"]);

    const toggle = mount(PdToggle, { props: { pressed: false, label: "收藏" } });
    await toggle.get("button").trigger("click");
    expect(toggle.emitted("update:pressed")?.at(-1)).toEqual([true]);

    const control = mount(PdSwitch, { props: { modelValue: false, label: "始终置顶" } });
    await control.get('[role="switch"]').trigger("click");
    expect(control.emitted("update:modelValue")?.at(-1)).toEqual([true]);
  });

  it("emits dismiss without owning feature data", async () => {
    const dialog = mount(PdDialog, {
      attachTo: document.body,
      props: { open: true, title: "分类管理" },
    });
    await dialog.get('[aria-label="关闭分类管理"]').trigger("click");
    expect(dialog.emitted("dismiss")).toHaveLength(1);
  });
});
```

Add three more focused cases in the same file:

1. Focus a host trigger, mount `PdDialog` through `v-if`, verify focus enters the modal, press `Escape`, unmount after `dismiss`, and verify the original connected trigger regains focus.
2. Mount with `closeOnOutside: false`, dispatch the Reka outside-interaction event, and verify no `dismiss`; mount with `true` and verify one `dismiss`.
3. Open `PdSelect` from its trigger, use `ArrowDown` and `Enter`, assert the value event, then use `Escape` and assert focus returns to the Select trigger.

- [ ] **Step 2: Run and observe the missing-component failure**

```bash
pnpm vitest run src/tests/ui-interactions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement typed wrapper contracts**

```ts
export interface PdSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

- `PdSelect`: `modelValue`, `label`, `options`, optional `placeholder`/`disabled`; emits `update:modelValue`.
- `PdDialog`: `open`, `title`, optional `description`, `closeLabel`, `closeOnOutside`; default/footer slots; emits `dismiss`. The feature decides whether closing is safe.
- `PdToggle`: `pressed`, `label`, optional icon; emits `update:pressed`.
- `PdSwitch`: `modelValue`, `label`, optional disabled; emits `update:modelValue`.

Use Reka's documented root/trigger/portal/content/item parts. `PdSelect` uses popper positioning plus `--reka-select-trigger-width` and `--reka-select-content-available-height` so menus remain inside Main and Sticky.

Because feature dialogs are mounted with `v-if` rather than a Reka `DialogTrigger`, `PdDialog` must implement deterministic focus restoration itself:

```ts
const returnFocusTarget = document.activeElement instanceof HTMLElement
  ? document.activeElement
  : null;

function restoreFocus(event: Event): void {
  event.preventDefault();
  queueMicrotask(() => {
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
  });
}
```

Wire this to Reka's close-auto-focus hook. Keep the dialog modal so Reka traps focus, allow its default initial focus to select the first focusable control, route Escape/root-close to one `dismiss` event, and prevent the outside-interaction event when `closeOnOutside` is false. The nested category-delete dialog must therefore capture its delete button separately and restore focus there when cancelled.

- [ ] **Step 4: Run focused and existing overlay tests**

```bash
pnpm vitest run src/tests/ui-interactions.test.ts src/tests/category-manager.test.ts src/tests/import-preview.test.ts
pnpm typecheck
```

Expected: PASS; existing feature behavior is unchanged.

- [ ] **Step 5: Commit the interaction layer**

```bash
git add src/components/ui src/styles/global.css src/tests/ui-interactions.test.ts src/tests/setup.ts
git commit -m "feat: add accessible interaction wrappers"
```

---

### Task 4: Make shortcut labels platform-aware and polish the workbench header

**Files:**
- Create: `src/ui/platform.ts`
- Create: `src/tests/platform-ui.test.ts`
- Modify: `src/components/WorkbenchIconRail.vue`
- Modify: `src/components/WorkbenchFilters.vue`
- Modify: `src/components/DashboardStatCards.vue`
- Modify: `src/tests/workbench-filters.test.ts`
- Modify: `src/tests/main-window.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing platform-label tests**

```ts
import { describe, expect, it } from "vitest";
import { shortcutLabels } from "@/ui/platform";

describe("platform-aware UI labels", () => {
  it("uses macOS labels", () => {
    expect(shortcutLabels("macos")).toEqual({
      localSearch: "⌘K",
      globalQuick: "Option+Space",
    });
  });

  it("uses the existing Windows accelerators", () => {
    expect(shortcutLabels("windows")).toEqual({
      localSearch: "Ctrl+K",
      globalQuick: "Ctrl+Alt+Space",
    });
  });
});
```

Run `pnpm vitest run src/tests/platform-ui.test.ts`; expect FAIL because the helper is absent.

- [ ] **Step 2: Implement the injectable helper**

```ts
export type DesktopUiPlatform = "macos" | "windows";

export function detectDesktopUiPlatform(platform = navigator.platform): DesktopUiPlatform {
  return /Mac/i.test(platform) ? "macos" : "windows";
}

export function shortcutLabels(platform: DesktopUiPlatform) {
  return platform === "macos"
    ? { localSearch: "⌘K", globalQuick: "Option+Space" }
    : { localSearch: "Ctrl+K", globalQuick: "Ctrl+Alt+Space" };
}
```

Only local hints use this helper. Runtime information continues displaying `info.shortcut.accelerator` returned by Rust.

- [ ] **Step 3: Add failing workbench presentation assertions**

Update `workbench-filters.test.ts` and `main-window.test.ts` to require:

- no `<select>` in `WorkbenchFilters`;
- category, tag, and sort expose named triggers;
- favorite, pinned, recent, and template filters expose pressed state;
- Clear is absent for the default query and present for a nondefault query;
- the rail contains labelled SVG icon buttons and no `.mac-lights` node or glyph text;
- all four real statistics remain present.

Run the focused files and confirm the new assertions fail on the existing UI.

- [ ] **Step 4: Migrate the rail to Lucide/shared controls**

Direct-import `LayoutDashboard`, `Star`, `FolderTree`, `PanelsTopLeft`, and `Settings`. Use `PdIconButton` for every icon-only rail action so keyboard focus shows the label-backed Tooltip as well as `aria-label`; test at least one focused rail Tooltip. Keep existing emit names and `data-test` attributes, remove simulated Main traffic lights, and expose the selected destination through `aria-current="page"` or pressed state.

- [ ] **Step 5: Migrate filters without changing `PromptQuery`**

- Search uses `Search` plus the platform-aware local label.
- Category/tag/sort use `PdSelect`.
- Boolean filters use `PdToggle` with `Star`, `Pin`, `History`, and `Braces`.
- Category sentinel `__manage__` emits `manageCategories` and never enters `PromptQuery`.
- Clear emits the existing event and renders only for nondefault state.

- [ ] **Step 6: Polish real dashboard statistics**

Use `LibraryBig`, `Zap`, `Star`, and `Pin`. Preserve the four real values. Add a five-segment visual pin-capacity marker while keeping accessible textual `n/5`; cards remain noninteractive.

- [ ] **Step 7: Run focused and full frontend tests**

```bash
pnpm vitest run src/tests/platform-ui.test.ts src/tests/workbench-filters.test.ts src/tests/main-window.test.ts
pnpm typecheck
pnpm vitest run
```

Expected: PASS; query patch semantics are unchanged.

- [ ] **Step 8: Commit the workbench header**

```bash
git add src/ui/platform.ts src/components/WorkbenchIconRail.vue src/components/WorkbenchFilters.vue src/components/DashboardStatCards.vue src/styles/global.css src/tests/platform-ui.test.ts src/tests/workbench-filters.test.ts src/tests/main-window.test.ts
git commit -m "feat: polish native workbench controls"
```

---

### Task 5: Polish the prompt source list, detail surface, and status bar

**Files:**
- Modify: `src/components/PromptListPane.vue`
- Modify: `src/components/PromptDetailPane.vue`
- Modify: `src/windows/MainWindow.vue`
- Modify: `src/tests/prompt-list-pane.test.ts`
- Modify: `src/tests/category-copy-regressions.test.ts`
- Modify: `src/tests/main-window.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add failing list/detail state tests**

Require accessible copy/row selection and no glyph icons:

```ts
expect(wrapper.get('[aria-label="复制提示词"]').exists()).toBe(true);
expect(wrapper.find(".v3-prompt-row.selected").attributes("aria-selected")).toBe("true");
expect(wrapper.text()).not.toContain("☆");
expect(wrapper.text()).not.toContain("▣");
```

Also assert invalid-variable feedback has status semantics and edit/new/export keep existing emits. Add fake-timer coverage for a distinct copy-success signal:

- while the clipboard promise is pending, the row receives `copyingId` and remains disabled;
- after either resolved clipboard result (`copied` or the real nonfatal discriminant `copied-with-stats-error`), `copyingId` clears and `copiedId` identifies that row for 1.2 seconds;
- after a rejected clipboard write, `copiedId` is never set;
- a second successful copy clears the prior timer, moves `copiedId`, and Main unmount clears the timer.

Run focused tests; expect the new assertions to fail.

- [ ] **Step 2: Convert rows into a continuous source list**

- Preserve row keyboard selection and `select`, `favorite`, `pin`, `copy` payloads.
- Add a distinct optional `copiedId` prop to `PromptListPane`; never infer success from `copyingId`.
- In `MainWindow`, add `copiedId`, one `copySuccessTimer`, and `onBeforeUnmount` cleanup. Set `copiedId` only after `copyPromptText` resolves (both resolved statuses mean the clipboard write succeeded), clear it after 1.2 seconds, and never set it in the catch path.
- Use `Star`, `Pin`/`PinOff`, `Copy`, and transient `Check` through `PdIconButton`. While `copiedId === prompt.id`, the label and Tooltip read `已复制`.
- Keep actions keyboard reachable even when visually de-emphasized.
- Use `PdBadge` for category/tags.
- Preserve full-body copy and existing toast/error behavior while adding the explicitly tested success timer above.

- [ ] **Step 3: Convert detail actions and warnings**

Use `FileText`, `Pin`, `Code2`, `ChevronDown`, `Copy`, `Pencil`, `Plus`, and `Download` to replace every current detail glyph, including `▤`, `⌖`, `〈/〉`, and `⌄`; copy is the only primary action. Use `PdStatusMessage` for invalid template syntax. Render prompt bodies as plain text with the semantic monospace stack; preserve empty state and all events.

- [ ] **Step 4: Refine Main status actions**

Replace text separators/raw buttons with low-emphasis `PdButton` actions using `Pin`, `Upload`, and `DatabaseBackup`. Replace Main's `✓`/`!` toast text prefix with decorative `CircleCheck`/`CircleAlert` SVG icons while retaining the existing live-region text and toast kind. Keep the same Sticky manager/import/export handlers.

- [ ] **Step 5: Run regressions**

```bash
pnpm vitest run src/tests/prompt-list-pane.test.ts src/tests/category-copy-regressions.test.ts src/tests/main-window.test.ts src/tests/clipboard.test.ts src/tests/template-variables.test.ts
pnpm typecheck
```

Expected: selection, favorite, pin, copy ordering, variable safety, and toolbar emits pass.

- [ ] **Step 6: Commit list/detail polish**

```bash
git add src/components/PromptListPane.vue src/components/PromptDetailPane.vue src/windows/MainWindow.vue src/styles/global.css src/tests/prompt-list-pane.test.ts src/tests/category-copy-regressions.test.ts src/tests/main-window.test.ts
git commit -m "feat: refine prompt browsing surfaces"
```

---

### Task 6: Migrate in-app overlays to shared Dialog and Select

**Files:**
- Modify: `src/components/CategoryManagerDialog.vue`
- Modify: `src/components/CategoryDeleteDialog.vue`
- Modify: `src/components/CategoryCreateDialog.vue`
- Modify: `src/components/RuntimeInfoDialog.vue`
- Modify: `src/components/ImportPreviewDialog.vue`
- Modify: `src/components/PromptEditorDialog.vue`
- Modify: `src/components/StickyManagerDialog.vue`
- Modify: `src/components/TemplateVariablesPanel.vue`
- Modify: `src/tests/category-manager.test.ts`
- Modify: `src/tests/import-preview.test.ts`
- Create: `src/tests/prompt-editor.test.ts`
- Modify: `src/tests/runtime-info.test.ts`
- Modify: `src/tests/template-variables.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add failing shared-overlay expectations**

Assert named dialog roles, no raw `<select>` in category transfer/editor category selection, no glyph close buttons, and unchanged outcomes. Create `src/tests/prompt-editor.test.ts` to mount the real editor (not Main's stub), modify a field, request Dialog dismissal, mock the native confirmation once false and once true, and prove the first request keeps the editor open while the second emits close without saving.

```bash
pnpm vitest run src/tests/category-manager.test.ts src/tests/import-preview.test.ts src/tests/prompt-editor.test.ts src/tests/runtime-info.test.ts src/tests/template-variables.test.ts
```

Expected: new structural expectations fail; existing business assertions remain green.

- [ ] **Step 2: Migrate category overlays first**

- Use `PdDialog`, `Folder`, `Pencil`, `Trash2`, `Plus`, and `X`. Every icon-only close/edit/delete action uses `PdIconButton` and exposes visible Tooltip text on focus; destructive actions that would be ambiguous retain an explicit text label.
- Replace transfer `<select>` with `PdSelect`.
- Preserve create/rename/delete emits, busy/error state, final-category disable rule, and target validation.
- Nested delete confirmation returns focus to its invoking button when cancelled.

- [ ] **Step 3: Migrate runtime and import overlays**

Runtime keeps `windowApi.runtimeInfo()` and the Rust-provided accelerator. Import keeps merge/replace radio semantics, validation summary, safe-backup wording, and transaction states; replace its `✓` status glyph with a decorative `CircleCheck` plus unchanged text, and prevent accidental backdrop close while busy.

- [ ] **Step 4: Migrate editor, Sticky manager, and template presentation**

Prompt Editor retains native dirty-close confirmation and validation; editor category uses `PdSelect`. Sticky Manager keeps manual order/five pins and replaces `↑`/`↓` text with Tooltip-backed `ArrowUp`/`ArrowDown` icon buttons. Template Variables keeps one-pass literal substitution and incomplete-field blocking. `PdDialog` only emits dismiss; features decide safety.

- [ ] **Step 5: Run overlay/data-safety regressions**

```bash
pnpm vitest run src/tests/category-manager.test.ts src/tests/import-preview.test.ts src/tests/prompt-editor.test.ts src/tests/runtime-info.test.ts src/tests/template-variables.test.ts src/tests/window-api.test.ts
pnpm typecheck
pnpm vitest run
```

Expected: PASS with unchanged command payloads and persistence behavior.

- [ ] **Step 6: Commit overlay migration**

```bash
git add src/components/CategoryManagerDialog.vue src/components/CategoryDeleteDialog.vue src/components/CategoryCreateDialog.vue src/components/RuntimeInfoDialog.vue src/components/ImportPreviewDialog.vue src/components/PromptEditorDialog.vue src/components/StickyManagerDialog.vue src/components/TemplateVariablesPanel.vue src/styles/global.css src/tests/category-manager.test.ts src/tests/import-preview.test.ts src/tests/prompt-editor.test.ts src/tests/runtime-info.test.ts src/tests/template-variables.test.ts
git commit -m "feat: unify accessible app dialogs"
```

---

### Task 7: Polish Quick and both Sticky densities

**Files:**
- Modify: `src/components/QuickPalette.vue`
- Modify: `src/windows/StickyWindow.vue`
- Modify: `src/tests/quick-palette.test.ts`
- Modify: `src/tests/sticky-window.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing native-window presentation tests**

Require:

- Quick has labelled Search/Copy/Braces icons and retains 12-result navigation;
- Sticky has no `.sticky-traffic` or Unicode control glyphs;
- settings, return, hide, reorder, copy, and empty-slot controls have accessible names and visible Tooltip text when icon-only;
- always-on-top is a `role="switch"` reflecting state;
- comfortable renders five slots with descriptions;
- compact renders five title rows without descriptions.

Run `pnpm vitest run src/tests/quick-palette.test.ts src/tests/sticky-window.test.ts`; expect the new presentation assertions to fail.

- [ ] **Step 2: Migrate Quick icons without changing copy flow**

Use `Search`, `Copy`, `Check`, and `Braces`. Preserve initial focus, arrow wrapping, Enter behavior, template routing, 12-result cap, copy-before-count ordering, and hide-after-success.

- [ ] **Step 3: Replace Sticky simulated chrome with functional controls**

- Remove nonfunctional red/yellow/green circles.
- Keep `data-tauri-drag-region` on the title region.
- Use `Settings`, `PanelTopOpen`, `Minus`, `GripVertical`, `Copy`, `Check`, and `Plus` only for real existing actions. Every icon-only action uses `PdIconButton` or the equivalent shared Tooltip contract and has a focused-Tooltip test.
- Replace handmade always-on-top with `PdSwitch`, still calling the existing async handler and preserving rollback/error feedback.

- [ ] **Step 4: Refit exact density contracts**

- Comfortable: 420×695 logical points, five slots, title plus up to two description lines.
- Compact: 340×270 logical points, five title-only rows.
- Use shared tokens adapted to `--pd-paper` and `--pd-paper-border`.
- The settings layer must fit both sizes without horizontal overflow.

- [ ] **Step 5: Run focused and full suites**

```bash
pnpm vitest run src/tests/quick-palette.test.ts src/tests/sticky-window.test.ts src/tests/window-api.test.ts src/tests/clipboard.test.ts
pnpm typecheck
pnpm vitest run
```

Expected: PASS with unchanged window-mode calls and copy behavior.

- [ ] **Step 6: Commit Quick/Sticky polish**

```bash
git add src/components/QuickPalette.vue src/windows/StickyWindow.vue src/styles/global.css src/tests/quick-palette.test.ts src/tests/sticky-window.test.ts
git commit -m "feat: polish quick and sticky windows"
```

---

### Task 8: Remove remaining control glyphs and validate responsive presentation

**Files:**
- Modify as needed: `src/components/PromptCard.vue`
- Modify as needed: `src/components/PromptDetailDrawer.vue`
- Modify if audit finds a missed glyph: `src/components/PromptDetailPane.vue`
- Modify if audit finds a missed glyph: `src/components/ImportPreviewDialog.vue`
- Modify if audit finds a missed glyph: `src/components/StickyManagerDialog.vue`
- Modify if audit finds a missed glyph: `src/components/QuickPalette.vue`
- Modify if audit finds a missed glyph: `src/windows/MainWindow.vue`
- Modify if audit finds a missed glyph: `src/windows/StickyWindow.vue`
- Modify: `src/styles/global.css`
- Modify: `src/tests/prompt-card.test.ts`
- Modify if audit cleanup changes a mounted surface: `src/tests/main-window.test.ts`
- Modify if audit cleanup changes a mounted surface: `src/tests/import-preview.test.ts`
- Modify if audit cleanup changes a mounted surface: `src/tests/quick-palette.test.ts`
- Modify if audit cleanup changes a mounted surface: `src/tests/sticky-window.test.ts`

- [ ] **Step 1: Run and classify the source audit**

```bash
rg -n '[⌂☆★▢▤⚙＋×⌕▣✎⇩⌖⌁⌄↑↓✓]' src --glob '*.vue' --glob '*.ts'
rg -n '〈/〉|⇅|!\{\}|"\{\}"|"✓" : "!"|quick-icon[^\n]*>P<' src --glob '*.vue' --glob '*.ts'
rg -n '<select|mac-lights|sticky-traffic' src --glob '*.vue'
```

The expanded audit deliberately covers existing pin/link/sort/preview/reorder/success/template glyphs (`⌖`, `⌁`, `⌄`, `〈/〉`, `↑`, `↓`, `⇅`, `✓`, `!{}`, `{}`, and Quick's `P`) in addition to the original V3 set. Classify matches rather than blindly replacing user-authored prompt text; application controls and status indicators are not exempt.

- [ ] **Step 2: Add failing assertions for any still-mounted legacy surface**

If `PromptCard` or `PromptDetailDrawer` is reachable or covered, update its test to require labelled shared/Lucide controls. Do not delete a component merely to satisfy the audit unless usage search proves removal independently safe.

- [ ] **Step 3: Replace remaining application-control glyphs**

Use existing `Pd*` wrappers and direct Lucide imports. Preserve event names/payloads, `stopPropagation`, and test hooks. Leave user content untouched.

- [ ] **Step 4: Add minimum-width CSS**

At `@media (max-width: 1100px)`, reduce trigger padding and nonessential label width while preserving a single filter row at the 1024 px Main minimum. Do not hide filters or create a second mobile workflow. Portal content uses available-width/height variables and remains in viewport.

- [ ] **Step 5: Re-run the audit**

Expected:

- no identified character is an application-control icon;
- no simulated Main/Sticky traffic-light group remains;
- raw `<select>` remains only in a deliberately documented native semantic case, otherwise none in migrated V3 surfaces.

- [ ] **Step 6: Run frontend quality gates**

```bash
pnpm format
pnpm format:check
pnpm typecheck
pnpm vitest run
pnpm build
```

Expected: PASS. Record bundle sizes against V3's CSS 38.34 kB and JS 125.96 kB and explain the dependency delta rather than inventing a threshold.

- [ ] **Step 7: Commit cleanup**

Before staging, run `git diff --name-only` and stage only the explicit Task 8 paths that actually changed.

```bash
git add src/components/PromptCard.vue src/components/PromptDetailDrawer.vue src/components/PromptDetailPane.vue src/components/ImportPreviewDialog.vue src/components/StickyManagerDialog.vue src/components/QuickPalette.vue src/windows/MainWindow.vue src/windows/StickyWindow.vue src/styles/global.css src/tests/prompt-card.test.ts src/tests/main-window.test.ts src/tests/import-preview.test.ts src/tests/quick-palette.test.ts src/tests/sticky-window.test.ts
git diff --cached --name-only
git commit -m "refactor: complete native UI component migration"
```

Do not stage `.superpowers/` or unrelated user files.

---

### Task 9: Run desktop verification and record conservative evidence

**Files:**
- Modify: `docs/testing/acceptance-report.md`

- [ ] **Step 1: Run the complete automated gate from repository root**

```bash
pnpm format:check
pnpm typecheck
pnpm vitest run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets --all-features -- -D warnings
git diff --check
```

Expected: every command exits 0. Record exact test counts, bundle sizes, and non-application sandbox limitations separately.

- [ ] **Step 2: Build and verify the macOS bundle**

```bash
pnpm tauri build --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/PromptDock.app
```

If Tauri's generated local bundle again has an invalid resource signature, repair only the generated artifact:

```bash
codesign --force --deep --sign - src-tauri/target/release/bundle/macos/PromptDock.app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/PromptDock.app
```

Do not alter source signing configuration merely to make a local smoke bundle pass.

- [ ] **Step 3: Perform non-destructive macOS native acceptance**

Launch the exact bundle path and observe:

- Main at 1360×860 and 1024×700;
- real macOS titlebar with no duplicate fake lights;
- one-row filters, keyboard Select open/select/Escape, Tooltips, Dialog focus/Escape;
- real SQLite statistics and prompt rows;
- category manager without mutating real data;
- Main → Sticky comfortable 420×695 → compact 340×270 → comfortable → Main;
- five Sticky slots at both densities;
- platform hint `⌘K` and Rust runtime accelerator `Option+Space`;
- no runtime UI-asset network request.

Do not copy a real prompt or execute destructive category transfer merely to produce evidence. Use dedicated test data if mutation is required.

- [ ] **Step 4: Record unavailable native evidence honestly**

Unless a Windows 10/11 x64 runner is actually used, mark Windows build/frame, `Ctrl+K`, `Ctrl+Alt+Space`, scaling, clipboard, Narrator, Quick, and Sticky as `UNVERIFIED_WINDOWS_RUNTIME`. Retain `UNVERIFIED_MACOS_RUNTIME` for VoiceOver or other physical scenarios not performed.

- [ ] **Step 5: Update the acceptance report**

Add a Native UI Polish addendum with branch/tested source commit, dependency versions, bundle delta, command results, macOS observations, DB path/read-only counts if queried, no-user-mutation confirmation, Windows/accessibility boundaries, findings, and conditional release status.

- [ ] **Step 6: Commit verification evidence**

```bash
git add docs/testing/acceptance-report.md
git commit -m "docs: record native UI polish acceptance"
```

- [ ] **Step 7: Final repository check**

```bash
git diff --check
git status --short --branch
git log -10 --oneline
```

Expected: no implementation changes remain unstaged; only preserved user-owned `.superpowers/` may be unrelated. Do not push, merge, or rebase.

---

## Completion definition

The work is complete only when the approved local dependencies are consumed through PromptDock wrappers, V3 application controls no longer use Unicode glyphs or simulated traffic lights, product behavior tests pass, the macOS bundle is built and inspected, and every unavailable Windows/accessibility scenario is explicitly labelled. Passing unit tests alone is insufficient, and a browser render is not a substitute for packaged native-window evidence.

