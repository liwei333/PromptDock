# PromptDock V1.1 Implementation Design

## Status and source of truth

This design records implementation decisions for the user-approved product package in `docs/product/`. It does not replace the product material. Conflicts are resolved in this order: `PRD.md`, `UI_DESIGN_SPEC.md`, `TECH_ARCHITECTURE.md`, then the HTML prototypes. The direct user request expands the example phase-0/1 prompt to the complete V1.1 delivery while keeping the mandated phase order.

## Scope

PromptDock is a macOS-only, single-user, offline prompt library. The shipped app has no account, cloud sync, remote API, telemetry, model invocation, automatic paste, or accessibility automation. SQLite in the Tauri application-data directory is the only business-data source. The first launch creates six categories and no sample prompts.

## Architecture

- Vue 3, strict TypeScript, Pinia, and Vite render three window-specific views from one frontend bundle.
- Tauri 2 owns the `main`, `quick`, and `sticky` native windows, global shortcut, single-instance lifecycle, native dialogs, and clipboard capability.
- Rust exposes narrow commands and owns validation, migrations, transactions, query construction, import/export, sticky ordering, and runtime settings.
- One `SqlitePool` is shared through managed Tauri state. Frontend stores cache query results only and re-query after the `prompts-changed` event.
- SQLx migrations create the base schema and then add `pin_order`; business code performs the one-time legacy pin backfill without deleting overflow records.

## Components and boundaries

- `src-tauri/src/domain/`: DTOs, validation, template detection, and typed public errors. It has no window or filesystem concerns.
- `src-tauri/src/db/`: app-data path, SQLite connection options, migrations, and default-category seeding.
- `src-tauri/src/repositories/`: parameterized prompt/category/settings queries and sticky transactions.
- `src-tauri/src/services/`: backup parsing/import/export and window lifecycle coordination.
- `src-tauri/src/commands/`: Tauri adapters that validate inputs, call repositories/services, and emit non-sensitive change events.
- `src/api/commands.ts`: the only frontend IPC mapping.
- `src/services/clipboard.ts`: the only frontend clipboard orchestration; it records usage only after a successful native write and distinguishes statistics failure.
- `src/composables/useTemplateVariables.ts`: single-pass, literal template extraction and rendering.
- `src/stores/`: query/UI state, never durable business storage.
- `src/components/` and `src/windows/`: focused UI modules matching the approved visual baseline.

## Data and error flow

All writes validate in Rust and execute with bound parameters. Prompt and category mutations return saved rows only after commit. Pin/unpin/reorder uses an immediate transaction, temporarily clears affected positions, assigns unique compact positions 1 through 5, and rejects a sixth slot with `PIN_LIMIT_REACHED`. Copy writes the full native clipboard text first; only then is `record_successful_copy` invoked. Import reads at most 10 MiB, validates all records before preview, stores a short-lived preview token, and commits merge/replace as one transaction. Replace creates a safety JSON backup before deleting existing rows.

Errors cross IPC as `{ code, message, detail? }` without prompt bodies. The UI preserves unsaved input, presents actionable errors, and never displays a success state after a failed database or clipboard operation.

## Native windows

- `main`: 1360×860, minimum 1024×700, normal management window.
- `quick`: 680×520, initially hidden, opened by `Option+Space` or the main-window fallback. It supports search, arrows, Enter, and Escape.
- `sticky`: fixed 340×270, undecorated, initially hidden, pale-yellow UI, native always-on-top enabled by default. Closing hides it; only explicit Quit terminates the process. Its location, visibility, and always-on-top preference are stored in `app_settings` and clamped to an available monitor on restore.

## Security and privacy

Capabilities are window-scoped and limited to the needed core window/event operations, clipboard write, and dialog access. There is no shell, HTTP, updater, remote asset, or arbitrary filesystem/SQL command. User text is rendered as text, never `v-html`, and logs never include full prompt bodies.

## Verification

Automated verification consists of Vitest/Vue Test Utils, strict TypeScript, Vite production build, Rust unit/integration tests with temporary SQLite files, `cargo clippy`, and `tauri build`. Native macOS verification covers application startup, cross-app clipboard, global shortcut focus, single instance, independent sticky lifecycle, always-on-top, position restoration, and actual JSON round trip. Every AT-01 through AT-25 receives PASS/FAIL/NOT_TESTED evidence in `docs/testing/acceptance-report.md`.

## Known implementation constraints

The app is built for local unsigned use. A successful `.app`/DMG build does not imply Apple notarization. Full-screen Spaces and external-monitor removal behavior are recorded from the actual machine rather than promised from compile output.
