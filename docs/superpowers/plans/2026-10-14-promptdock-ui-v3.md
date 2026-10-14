# PromptDock UI V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved V3 SQLite-backed workbench, safe category manager, and comfortable/compact native sticky window without regressing existing offline desktop behavior.

**Architecture:** Extend the existing Rust repository and typed IPC contracts with composable filters, a real daily copy aggregate, strict category-transfer invariants, and a persisted sticky density. Keep `MainWindow.vue` as the coordinator while extracting focused Vue presentation components for the icon rail, filters, statistics, list, details, and category dialogs.

**Tech Stack:** Tauri 2, Vue 3 Composition API, TypeScript 6, Pinia, Rust 1.92, SQLx/SQLite, Vitest, Vue Test Utils, Cargo test.

---

## File map

**Database and Rust domain**

- Create `src-tauri/migrations/0003_daily_copy_stats.sql`: local-date aggregate table for accurate post-upgrade daily copy counts.
- Modify `src-tauri/src/domain/models.rs`: independent workbench filters, `today_copies`, and sticky density types.
- Modify `src-tauri/src/repositories/prompt_repo.rs`: combined filtering, distinct tag query, transactional copy aggregate update, dashboard query.
- Modify `src-tauri/src/repositories/category_repo.rs`: final-category guard and metadata-preserving transfer.
- Modify `src-tauri/src/commands/prompts.rs` and `src-tauri/src/lib.rs`: expose distinct tags.
- Modify `src-tauri/src/commands/windows.rs`, `src-tauri/src/window_mode.rs`, and `src-tauri/tauri.conf.json`: persisted density and native resizing.
- Modify `src-tauri/src/tests/repository_tests.rs` and `src-tauri/src/tests/window_mode_tests.rs`: repository and deterministic window-runtime coverage.

**Typed frontend data**

- Modify `src/types/prompt.ts` and `src/types/runtime.ts`: mirror Rust payloads.
- Modify `src/api/commands.ts`: tag query and density patch.
- Modify `src/stores/promptStore.ts`: load tags with page/category/stats/sticky data and reset filters explicitly.

**Vue components**

- Create `src/components/WorkbenchIconRail.vue`.
- Create `src/components/WorkbenchFilters.vue`.
- Create `src/components/DashboardStatCards.vue`.
- Create `src/components/PromptListPane.vue`.
- Create `src/components/PromptDetailPane.vue`.
- Create `src/components/CategoryManagerDialog.vue`.
- Create `src/components/CategoryDeleteDialog.vue`.
- Modify `src/windows/MainWindow.vue`: coordinator state and V3 composition.
- Modify `src/windows/StickyWindow.vue`: comfortable/compact rendering and controls.
- Modify `src/styles/global.css`: V3 tokens/layout, responsive behavior, dialogs, and sticky densities.

**Frontend tests**

- Modify `src/tests/main-window.test.ts` and `src/tests/sticky-window.test.ts`.
- Create `src/tests/workbench-filters.test.ts`.
- Create `src/tests/category-manager.test.ts`.
- Create `src/tests/prompt-list-pane.test.ts`.

### Task 1: Combined SQLite filters and accurate dashboard statistics

**Files:**

- Create: `src-tauri/migrations/0003_daily_copy_stats.sql`
- Modify: `src-tauri/src/domain/models.rs`
- Modify: `src-tauri/src/repositories/prompt_repo.rs`
- Modify: `src-tauri/src/commands/prompts.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/tests/repository_tests.rs`

- [ ] **Step 1: Write failing repository tests**

Add tests that create prompts spanning two categories/tags and assert that category + tag + favorite + pinned + recent + template filters are applied together. Add a test that records two successful copies, verifies the lifetime count, and verifies `today_copies == 2` while total/favorite/pinned statistics remain correct. Add a test that distinct tags are deduplicated and sorted.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
cd src-tauri && cargo test repository_tests::workbench_filters_compose repository_tests::successful_copies_update_daily_dashboard_total repository_tests::lists_distinct_prompt_tags -- --nocapture
```

Expected: compilation or assertion failure because the new query fields, statistic, tag method, and migration do not exist.

- [ ] **Step 3: Add the migration and domain fields**

Create the aggregate table:

```sql
CREATE TABLE IF NOT EXISTS daily_copy_stats (
    copy_date TEXT PRIMARY KEY NOT NULL,
    copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0)
);
```

Extend `PromptQuery` with optional `tag`, `favorite_only`, `pinned_only`, `recent_only`, and `template_only` fields. Rename the dashboard transport field from the ambiguous `recent` to `today_copies`; retain the existing view enum for quick-panel compatibility.

- [ ] **Step 4: Implement repository behavior**

Use `QueryBuilder` bindings for every user value. For tags, compare normalized JSON array values through SQLite `json_each(p.tags_json)` rather than string interpolation. Change `record_successful_copy` to one transaction that updates the prompt row and upserts today's local `YYYY-MM-DD` aggregate. Add `list_tags()` and query the daily aggregate in `dashboard_stats()`.

- [ ] **Step 5: Expose and type the tag command**

Add `list_prompt_tags` to the Rust command list and return `Vec<String>` from `PromptRepository::list_tags()`.

- [ ] **Step 6: Run focused and full Rust tests**

Run:

```bash
cd src-tauri && cargo test repository_tests:: -- --nocapture
cd src-tauri && cargo test
```

Expected: all repository tests and the full Rust suite pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/migrations/0003_daily_copy_stats.sql src-tauri/src/domain/models.rs src-tauri/src/repositories/prompt_repo.rs src-tauri/src/commands/prompts.rs src-tauri/src/lib.rs src-tauri/src/tests/repository_tests.rs
git commit -m "feat: add V3 workbench queries and daily copy stats"
```

### Task 2: Enforce safe category transfer invariants

**Files:**

- Modify: `src-tauri/src/repositories/category_repo.rs`
- Test: `src-tauri/src/tests/repository_tests.rs`

- [ ] **Step 1: Write failing transaction and integrity tests**

Create three prompts in the source category with distinguishable bodies. Capture IDs, body hashes/bytes, tags, favorite state, pinned order, copy counts, timestamps, and total count. Delete-and-transfer the source, then assert the source is gone, target count increased by three, total count is unchanged, and all captured fields except `category_id/category_name` are unchanged. Add tests that deleting the last category and cancelling before repository invocation leave the database unchanged; UI cancellation is covered later.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
cd src-tauri && cargo test repository_tests::category_transfer_preserves_prompt_content_and_metadata repository_tests::category_delete_rejects_the_final_category -- --nocapture
```

Expected: the metadata test fails because transfer currently rewrites `updated_at`; the last-category test fails because no guard exists.

- [ ] **Step 3: Implement minimal repository changes**

Inside the existing transaction, count categories and return a conflict when the count is one. Change reassignment to:

```sql
UPDATE prompts SET category_id = ? WHERE category_id = ?
```

Keep source/target existence checks and delete only after successful reassignment.

- [ ] **Step 4: Run focused and full Rust tests**

Run the focused command from Step 2, then `cd src-tauri && cargo test`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/repositories/category_repo.rs src-tauri/src/tests/repository_tests.rs
git commit -m "fix: preserve prompts during category transfer"
```

### Task 3: Extend typed frontend data and filter state

**Files:**

- Modify: `src/types/prompt.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/stores/promptStore.ts`
- Create: `src/tests/workbench-filters.test.ts`

- [ ] **Step 1: Write failing store/filter tests**

Assert that store loading requests the new independent filters, loads distinct tags, maps `todayCopies`, and can reset every V3 filter while keeping the selected sort. Mock only the IPC boundary.

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
pnpm vitest run src/tests/workbench-filters.test.ts
```

Expected: failure because the types, tag API, tags state, and reset method are missing.

- [ ] **Step 3: Implement types and API**

Mirror Rust camelCase fields exactly and add `promptApi.listTags()` invoking `list_prompt_tags`.

- [ ] **Step 4: Implement store state**

Load tags in the existing `Promise.all`, expose them as `tags`, and add `resetFilters()` that restores search/category/tag/boolean filters/view/tab to the V3 baseline without mutating persisted business data.

- [ ] **Step 5: Run the focused test, typecheck, and frontend suite**

```bash
pnpm vitest run src/tests/workbench-filters.test.ts
pnpm typecheck
pnpm test:run
```

- [ ] **Step 6: Commit**

```bash
git add src/types/prompt.ts src/api/commands.ts src/stores/promptStore.ts src/tests/workbench-filters.test.ts
git commit -m "feat: add typed V3 workbench filters"
```

### Task 4: Build category manager and safe-delete dialogs

**Files:**

- Create: `src/components/CategoryManagerDialog.vue`
- Create: `src/components/CategoryDeleteDialog.vue`
- Create: `src/tests/category-manager.test.ts`
- Modify: `src/windows/MainWindow.vue`

- [ ] **Step 1: Write failing component tests**

Cover category rows and counts, create validation, inline rename with duplicate/server errors, disabled delete when only one category remains, delete dialog destination choices excluding the source, cancel without an API call, and confirmation with `(sourceId, targetId)`.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm vitest run src/tests/category-manager.test.ts
```

Expected: module-not-found failures for the two new components.

- [ ] **Step 3: Implement the delete dialog**

Use a real `<select>`, require a destination, state the prompt count, emit only after valid confirmation, and preserve the dialog after a server error.

- [ ] **Step 4: Implement the manager dialog**

Keep local form state only for names and pending action. Delegate create/rename/delete to typed API calls supplied by the coordinator or emitted events. Use `role="dialog"`, labelled headings, focusable controls, and no `v-html`.

- [ ] **Step 5: Wire the coordinator**

Replace the direct hard-coded-to-General delete path in `MainWindow.vue`. After a successful mutation, call `store.load()` and keep/reset filters according to whether the active category still exists.

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm vitest run src/tests/category-manager.test.ts src/tests/category-copy-regressions.test.ts
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/components/CategoryManagerDialog.vue src/components/CategoryDeleteDialog.vue src/tests/category-manager.test.ts src/windows/MainWindow.vue
git commit -m "feat: add safe V3 category management"
```

### Task 5: Compose the V3 split workbench

**Files:**

- Create: `src/components/WorkbenchIconRail.vue`
- Create: `src/components/WorkbenchFilters.vue`
- Create: `src/components/DashboardStatCards.vue`
- Create: `src/components/PromptListPane.vue`
- Create: `src/components/PromptDetailPane.vue`
- Create: `src/tests/prompt-list-pane.test.ts`
- Modify: `src/tests/main-window.test.ts`
- Modify: `src/windows/MainWindow.vue`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing component and integration tests**

Assert the icon rail labels/actions, all combinable filter controls, four statistics, selected row state, direct row copy, fixed detail content/actions, three category-manager entry points, empty states, and existing quick/sticky transition protections.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm vitest run src/tests/prompt-list-pane.test.ts src/tests/main-window.test.ts
```

- [ ] **Step 3: Implement small presentational components**

Components receive typed props and emit intent. They do not call SQLite directly. Keep user content in text interpolation and provide `aria-label`, focus-visible states, and semantic buttons/forms.

- [ ] **Step 4: Refactor `MainWindow.vue` into the coordinator**

Use `selectedId` plus a computed selected prompt. Wire filters to `store.load`, keep debounced search, retain editor/import/runtime/quick/sticky dialogs, and reselect the first visible prompt after filtered loads when the previous selection disappears.

- [ ] **Step 5: Implement V3 CSS**

Use local system fonts and the reference tokens (`#2469f6`, `#f8f9fc`, `#e7ebf2`, `#19243a`). Build an 84 px rail, a flexible top-filter grid, four cards, and a 44/56 split pane. At widths near the 1024 px minimum, allow filters to wrap and preserve usable scroll regions rather than hiding actions.

- [ ] **Step 6: Run focused tests, full tests, typecheck, and format check**

```bash
pnpm vitest run src/tests/prompt-list-pane.test.ts src/tests/main-window.test.ts
pnpm test:run
pnpm typecheck
pnpm format:check
```

Run `pnpm format` only for files changed by this task if formatting fails, then repeat the checks.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkbenchIconRail.vue src/components/WorkbenchFilters.vue src/components/DashboardStatCards.vue src/components/PromptListPane.vue src/components/PromptDetailPane.vue src/tests/prompt-list-pane.test.ts src/tests/main-window.test.ts src/windows/MainWindow.vue src/styles/global.css
git commit -m "feat: refactor the main window into the V3 workbench"
```

### Task 6: Add comfortable and compact native sticky densities

**Files:**

- Modify: `src-tauri/src/commands/windows.rs`
- Modify: `src-tauri/src/window_mode.rs`
- Modify: `src-tauri/src/tests/window_mode_tests.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/types/runtime.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/windows/StickyWindow.vue`
- Modify: `src/styles/global.css`
- Modify: `src/tests/sticky-window.test.ts`

- [ ] **Step 1: Write failing Rust runtime tests**

Extend the fake runtime to record sticky sizes. Assert density changes are serialized, persisted, apply comfortable `420×695` and compact `340×270`, and restore the original density/size when persistence or native resize fails.

- [ ] **Step 2: Run focused Rust tests and confirm RED**

```bash
cd src-tauri && cargo test window_mode_tests::density -- --nocapture
```

- [ ] **Step 3: Implement Rust density settings**

Add a serde lower-case `StickyDensity` enum with an approved default, include it in `StickySettings` using backward-compatible serde defaults, accept it in the patch, add a runtime resize method, and implement a compensated `set_sticky_density` transition under the existing mutex. Configure the saved size before position clamping during startup/mode entry.

- [ ] **Step 4: Relax static window bounds**

Allow the native sticky window to range from 340×270 to 420×695 in `tauri.conf.json`; the application command, not CSS alone, selects the active size.

- [ ] **Step 5: Write failing Vue density tests**

Assert comfortable cards show descriptions, compact rows hide them, five slots remain, the menu invokes `setStickySettings({ density })`, and a rejected change renders accessible feedback without changing the displayed mode.

- [ ] **Step 6: Run frontend density tests and confirm RED**

```bash
pnpm vitest run src/tests/sticky-window.test.ts
```

- [ ] **Step 7: Implement typed API and sticky UI**

Add density to TypeScript settings, render the two V3 layouts from the same five prompt slots, and keep copy/template/always-on-top/full-mode/close behavior unchanged.

- [ ] **Step 8: Run all focused and full checks**

```bash
cd src-tauri && cargo test window_mode_tests:: -- --nocapture
cd src-tauri && cargo test
pnpm vitest run src/tests/sticky-window.test.ts
pnpm test:run
pnpm typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/windows.rs src-tauri/src/window_mode.rs src-tauri/src/tests/window_mode_tests.rs src-tauri/tauri.conf.json src/types/runtime.ts src/api/commands.ts src/windows/StickyWindow.vue src/styles/global.css src/tests/sticky-window.test.ts
git commit -m "feat: add V3 sticky window densities"
```

### Task 7: Final verification and native macOS evidence

**Files:**

- Modify if needed: `docs/testing/acceptance-report.md`

- [ ] **Step 1: Re-read the approved design and V3 acceptance requirements**

Verify every promised component, invariant, filter, category flow, and sticky behavior against `docs/superpowers/specs/2026-10-14-promptdock-ui-v3-design.md` and the reference package.

- [ ] **Step 2: Run static and automated verification**

```bash
pnpm format:check
pnpm typecheck
pnpm test:run
pnpm build
cd src-tauri && cargo fmt --check
cd src-tauri && cargo test
pnpm tauri build
```

Record exact exit codes, test counts, warnings, and bundle paths.

- [ ] **Step 3: Inspect repository safety**

Run:

```bash
git diff --check
git status --short --branch
rg -n "localStorage|BroadcastChannel|v-html|https?://" src src-tauri --glob '!Cargo.lock'
```

Confirm the user's `.superpowers/` remains untracked and excluded from commits, no remote business call was introduced, and no real database file is present in the repository.

- [ ] **Step 4: Native smoke test**

Launch the built `.app` or `pnpm tauri dev` on this Mac. Validate main workbench rendering, real SQLite counts, category transfer with test data, comfortable/compact resize, position restoration, always-on-top, clipboard copy into a local text editor, template variable copy, `Option+Space`, and cross-window refresh. Mark anything not actually exercised as `UNVERIFIED_MACOS_RUNTIME`.

- [ ] **Step 5: Update evidence and commit only if the report changes**

```bash
git add docs/testing/acceptance-report.md
git commit -m "docs: record PromptDock UI V3 acceptance"
```

Do not create an empty commit. Do not push, merge, or rebase.
