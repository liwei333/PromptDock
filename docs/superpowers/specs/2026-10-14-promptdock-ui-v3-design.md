# PromptDock UI V3 Design

**Date:** 2026-10-14  
**Status:** Approved by the product owner  
**Branch:** `feat/promptdock-ui-v3-simplify`

## Goal

Refactor the existing PromptDock desktop application to the V3 workbench and yellow sticky-note layouts while preserving the production Tauri, Rust, SQLite, clipboard, template, backup, shortcut, and multi-window behavior. This is an incremental product upgrade, not a rewrite and not an adoption of the HTML prototypes' `localStorage` data layer.

## Authority and resolved conflicts

The product owner confirmed that the V3 reference package supersedes the older visual and interaction clauses for:

- the full-window navigation and split-pane layout;
- the workbench filter model;
- category deletion destination selection;
- sticky-window density and dimensions.

The existing PRD remains authoritative for SQLite durability, offline operation, system clipboard behavior, variable-template safety, JSON backup, global shortcuts, five pinned slots, accessibility, and error handling.

Accordingly, the V3 narrow icon rail replaces the 253 px dark sidebar, the fixed detail pane replaces the overlay-only reading flow, category deletion may transfer prompts to any other category, and the sticky window gains comfortable and compact densities. No account, network, synchronization, AI API, automatic paste, telemetry, or updater capability is introduced.

## Current implementation baseline

The repository already provides:

- one SQLite pool shared by `main`, `quick`, and `sticky` windows;
- typed Vue-to-Rust commands and repositories;
- prompt CRUD, search, favorites, pinned ordering, variable templates, clipboard copying, and JSON backup;
- category create, rename, and transactional delete-and-transfer repository methods;
- an independent native sticky window with saved position and native always-on-top behavior;
- cross-window `prompts-changed` refresh events;
- 32 passing frontend tests and 66 passing Rust tests at the start of this work.

The implementation must extend these paths rather than replace them.

## Architecture

### 1. Query and dashboard data

`PromptQuery` will retain its existing fields for compatibility and add independent optional filters for tag, favorite, pinned, recently used, and template content. The repository will combine these predicates with search and category filters in one parameterized SQL query. The main workbench will use these independent fields, while the quick palette can continue using a minimal search query.

A dedicated Rust query will return the distinct tags stored in `tags_json`, so the filter menu is based on complete SQLite data rather than only the currently loaded page.

The dashboard response will expose:

- total prompts;
- copies recorded today;
- favorite prompts;
- pinned sticky slots.

Accurate daily copy totals cannot be reconstructed from the existing lifetime `copy_count` and single `last_copied_at` value. A sequential migration will therefore add a small local daily aggregate table keyed by local calendar date. `record_successful_copy` will update the prompt's lifetime statistics and the current local day's aggregate inside one SQLite transaction. Existing prompt data is unchanged; daily totals begin accumulating after the migration is installed.

### 2. Full-window workbench

The full window will be reorganized into four stable regions:

1. An approximately 84 px icon rail for workbench, favorites, category management, sticky mode, and settings.
2. A top search/filter row whose filters combine instead of navigating to duplicate pages.
3. Four dashboard cards populated from SQLite.
4. A lower split pane with a scrollable prompt list on the left and a persistent detail pane on the right.

The workbench keeps a selected prompt ID rather than a detached prompt object. After a refresh it resolves the selection against current results, selects the first visible result when appropriate, and clears the detail pane when the filtered result is empty. New/edit dialogs, template-variable entry, clipboard copying, import/export, and sticky management continue to call the existing services.

The icon rail never renders user content and all user text remains Vue text interpolation, not `v-html`.

### 3. Category management and safe deletion

A dedicated category manager dialog will list every category with its prompt count and provide create, rename, and delete actions. The delete flow is a second dialog that requires an explicit destination category different from the source and states how many prompts will move.

Repository invariants will be enforced independently of the UI:

- source and target must exist;
- source and target must differ;
- at least one category must remain;
- prompt reassignment and source deletion happen in one transaction;
- moving categories does not rewrite prompt body, UUID, tags, favorite state, pinned state/order, copy count, last-copy time, creation time, or content-related update time;
- any failure rolls back both operations.

Default categories are not treated as permanently undeletable under the approved V3 rules. New-prompt defaults continue to prefer a category named `通用效率`, then fall back to the first available category, so deleting that original default does not make the editor unusable.

### 4. Sticky comfortable and compact densities

The sticky window keeps the same native window label and shared SQLite source. A persistent density setting is added to the existing sticky settings:

- comfortable: approximately 420×695, five yellow cards showing title and up to two preview lines;
- compact: exactly 340×270, five title rows.

Changing density calls a Rust window command that resizes the real Tauri window and persists the chosen value. The operation is serialized with existing window-mode settings so a persistence or native resize failure can be surfaced without silently reporting success. Compact mode remains the recovery-safe minimum size.

Both densities preserve the same five pinned IDs and manual order. Clicking a normal item copies the full body without hiding the window; a template item opens the existing quick variable workflow. The footer exposes management/sorting and the real native always-on-top preference.

### 5. Event and error flow

All successful prompt and category mutations continue emitting `prompts-changed`. The main and sticky windows re-query SQLite after that event. UI dialogs stay open when validation or a command fails, preserving user input.

Errors are separated into:

- input errors shown beside the relevant field;
- repository conflicts such as duplicate categories, identical transfer targets, final-category deletion, and a full sticky list;
- native window errors such as resize or always-on-top failure;
- clipboard success with statistics failure, which remains distinct from clipboard failure.

## Component boundaries

The main window remains the coordinator, while focused components own presentation and local form state:

- `WorkbenchIconRail.vue`: navigation actions and accessible icon buttons;
- `WorkbenchFilters.vue`: search, combined filters, clear action, and sort;
- `DashboardStatCards.vue`: four read-only SQLite-backed statistics;
- `PromptListPane.vue`: selectable rows and direct copy/favorite/pin actions;
- `PromptDetailPane.vue`: persistent details, template controls, and actions;
- `CategoryManagerDialog.vue`: category list, create, rename, and delete entry;
- `CategoryDeleteDialog.vue`: destination selection and destructive confirmation;
- `StickyWindow.vue`: density-aware rendering and existing copy/window behavior.

The split prevents `MainWindow.vue` from accumulating all V3 rendering and makes each behavior independently testable.

## Testing strategy

Implementation follows red-green-refactor cycles.

Rust tests will cover:

- combined query filters;
- distinct tag listing;
- atomic daily copy-stat updates;
- refusing to delete the last category;
- refusing same/missing transfer targets;
- rollback when reassignment or deletion fails;
- prompt count and body hashes unchanged after a three-prompt transfer;
- density serialization and native resize behavior where the runtime abstraction allows deterministic testing.

Vue tests will cover:

- four real statistics and V3 workbench regions;
- combining and clearing filters;
- stable selection in the split pane;
- all three category manager entry points;
- create, rename, cancel-delete, invalid target, and confirmed transfer flows;
- five sticky slots in both densities;
- density switching and rejection feedback;
- normal and template copy paths.

Final verification includes formatting checks, TypeScript checking, the full frontend suite, Rust tests, the frontend build, the Tauri build, and a native macOS smoke test. System-level interactions that cannot be proven automatically are reported separately with explicit evidence or `UNVERIFIED_MACOS_RUNTIME`.

## Delivery boundaries

- No `localStorage` or `BroadcastChannel` business state.
- No destructive database reset and no editing of the user's real database during automated tests.
- No dependency addition unless an existing library cannot satisfy a required behavior.
- No push, merge, or rebase.
- The existing untracked `.superpowers/` directory is preserved and excluded from task commits.
