# PromptDock V1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the complete offline PromptDock V1.1 macOS application, including SQLite CRUD, native clipboard, quick search window, five-slot sticky window, backup/restore, tests, and installable artifacts.

**Architecture:** One Vue 3 bundle renders `main`, `quick`, and `sticky` views selected by Tauri window label. Narrow typed IPC commands call Rust services and a single SQLx SQLite pool located in Tauri `app_data_dir`; internal events trigger cross-window re-querying.

**Tech Stack:** Tauri 2, Vue 3, TypeScript, Vite, Pinia, Vitest, Vue Test Utils, Rust 1.92, SQLx SQLite, official Tauri clipboard/global-shortcut/single-instance/dialog plugins.

---

### Task 1: Lock the toolchain and test harness

**Files:** `package.json`, `vite.config.ts`, `src-tauri/Cargo.toml`, `src/tests/setup.ts`, `docs/testing/environment.md`

- [ ] Add Pinia, official Tauri frontend plugins, Vitest, Vue Test Utils, jsdom, and coverage tooling.
- [ ] Add SQLx, Tokio, UUID, chrono, tempfile, error, and official Tauri Rust plugins.
- [ ] Add `typecheck`, `test`, `test:run`, and format-check scripts.
- [ ] Run the empty frontend and Rust suites and record exact versions.
- [ ] Commit `chore: configure PromptDock toolchain and tests`.

### Task 2: Build the SQLite domain through TDD

**Files:** `src-tauri/migrations/*.sql`, `src-tauri/src/domain/*`, `src-tauri/src/db/mod.rs`, `src-tauri/src/repositories/*`, `src-tauri/src/tests/*`

- [ ] Write failing migration/seed tests: first start creates six categories and zero prompts; second start is idempotent.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml repository_tests` and confirm the missing-module failure.
- [ ] Implement SQLite options (`foreign_keys`, WAL, busy timeout), migration execution, and seed transaction.
- [ ] Write failing validation and CRUD tests for whitespace, Unicode lengths, invalid categories, multiline bodies, tags, special SQL characters, filters, sorting, and restart persistence.
- [ ] Implement minimal models, validation, parameterized repository CRUD, dashboard statistics, favorite, and successful-copy recording.
- [ ] Write failing sticky tests for 0/1/5 slots, sixth-slot rejection, duplicate pins, compact removal, reorder validation, delete compaction, and legacy overflow preservation.
- [ ] Implement transactional pin/unpin/reorder and settings persistence; rerun all Rust tests.
- [ ] Commit `feat: add persistent SQLite prompt domain`.

### Task 3: Expose typed IPC and frontend core services

**Files:** `src-tauri/src/commands/*`, `src-tauri/src/lib.rs`, `src/types/*`, `src/api/commands.ts`, `src/composables/useTemplateVariables.ts`, `src/services/clipboard.ts`, `src/tests/*`

- [ ] Write failing template tests for duplicates, spaces, Unicode, 30-variable limit, `$&`, backslashes, and no recursive replacement.
- [ ] Implement the single-pass literal template utility and make the tests green.
- [ ] Write failing clipboard orchestration tests for success, native-write failure, and copy-count failure.
- [ ] Implement one clipboard service used by all windows; record only after native success.
- [ ] Add typed command wrappers and narrow Rust command adapters with structured errors and `prompts-changed` events.
- [ ] Run frontend tests, TypeScript checking, and Rust tests.
- [ ] Commit `feat: expose typed PromptDock IPC services`.

### Task 4: Implement the real main management window

**Files:** `src/App.vue`, `src/main.ts`, `src/styles/*`, `src/stores/*`, `src/windows/MainWindow.vue`, `src/components/*`, `src/tests/*`

- [ ] Write failing store/component tests for load states, card event separation, editor validation, unsaved-change confirmation, sixth pin rejection, and failure messages.
- [ ] Implement Pinia queries and mutations backed only by IPC.
- [ ] Implement the approved sidebar, toolbar, filters, cards, pinned panel, detail drawer, create/edit/delete, category creation, favorites, pins, and settings/runtime information.
- [ ] Verify 1024×700 and 1360×860 layouts, keyboard focus, empty/error states, and pure-text rendering.
- [ ] Run Vitest, typecheck, and production build.
- [ ] Commit `feat: build SQLite-backed management window`.

### Task 5: Implement quick window, template flow, and native lifecycle

**Files:** `src/components/QuickPalette.vue`, `src/components/TemplateVariablesPanel.vue`, `src/windows/QuickWindow.vue`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/commands/windows.rs`, `src-tauri/src/lib.rs`, `src/tests/quick-palette.test.ts`

- [ ] Write failing tests for 12-result limit, Chinese search, arrow wraparound, Enter, Escape, and template gating.
- [ ] Implement reusable quick palette and variable panel.
- [ ] Configure the hidden native `quick` window and exact window-scoped capabilities.
- [ ] Register `Option+Space` once in Rust, persist/report conflict status, and keep the main-window `⌘K` fallback.
- [ ] Add single-instance focus behavior and explicit app-menu open/quit actions.
- [ ] Run automated tests and perform a native quick-window smoke test.
- [ ] Commit `feat: add native quick search window`.

### Task 6: Implement the five-slot sticky window

**Files:** `src/windows/StickyWindow.vue`, `src/components/StickyManagerDialog.vue`, `src/styles/sticky.css`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/commands/windows.rs`, `src/tests/sticky-window.test.ts`

- [ ] Write failing tests for five fixed rows, empty slots, long-title truncation, row keyboard activation, template handoff, and copy feedback.
- [ ] Implement the approved pale-yellow 340×270 UI and main-window ordering manager.
- [ ] Configure a hidden, fixed, undecorated native `sticky` window with real always-on-top and titlebar dragging.
- [ ] Persist/clamp visibility, position, and always-on-top; close hides without terminating.
- [ ] Re-query on `prompts-changed`; never reorder on copy count.
- [ ] Run Rust/frontend tests and native lifecycle smoke tests.
- [ ] Commit `feat: add native five-slot sticky window`.

### Task 7: Implement safe JSON backup and restore

**Files:** `src-tauri/src/services/*`, `src-tauri/src/commands/backup.rs`, `src/components/ImportPreviewDialog.vue`, `src/types/backup.ts`, `src-tauri/src/tests/backup_tests.rs`, `src/tests/import-preview.test.ts`

- [ ] Write failing Rust tests for current-format round trip, legacy v1 UUID mapping, invalid JSON, 10 MiB/10,000-item limits, duplicate IDs, rollback, and replace-backup failure.
- [ ] Implement full-file validation, 10-minute preview tokens, merge conflict policy, atomic JSON export, and pre-replace safety backup.
- [ ] Implement native save/open flow, preview UI, default merge, explicit replace confirmation, and cancellation without writes.
- [ ] Run round-trip tests and verify field-by-field equality.
- [ ] Commit `feat: add transactional backup and restore`.

### Task 8: Harden, build, and produce acceptance evidence

**Files:** `README.md`, `docs/testing/test-report.md`, `docs/testing/acceptance-report.md`, `docs/testing/known-issues.md`, `docs/product/reference/acceptance-checklist.md`

- [ ] Run formatting, strict TypeScript, all frontend tests, frontend production build, all Rust tests, Clippy, and Tauri configuration validation.
- [ ] Run `pnpm tauri build` and record actual `.app`/DMG paths and signing status.
- [ ] Launch the native application and execute AT-01 through AT-25 where automation/available UI control permits; mark anything not actually exercised as NOT_TESTED.
- [ ] Inspect runtime database path, tables, migrations, default categories, persisted records, and lack of business `localStorage`/network dependencies.
- [ ] Update documentation and evidence from real results.
- [ ] Commit `docs: record PromptDock V1.1 verification` without pushing or merging.
