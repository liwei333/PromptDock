# PromptDock V1.1 Verification Report

Tested 2026-10-14 on the environment recorded in `environment.md`. The accepted release candidate was built from branch `fix/edit-menu-exclusive-window-modes-implementation` at `d59c3b531107c4fc55903bcae72f51dfce26c7d3`; the documentation-only release commit is intentionally later than that accepted application source.

## Final automated gates

| Command                                                                                                            | Result | Evidence                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                                | PASS   | Prettier: all matched files use Prettier style.                                                                                           |
| `pnpm typecheck`                                                                                                   | PASS   | `vue-tsc --noEmit`, exit 0.                                                                                                               |
| `NODE_OPTIONS=--unhandled-rejections=strict pnpm test:run`                                                         | PASS   | Vitest: 8 files, 23 tests passed.                                                                                                         |
| `pnpm build`                                                                                                       | PASS   | 56 modules; CSS 20.09 kB (5.01 kB gzip), JS 127.73 kB (45.20 kB gzip).                                                                    |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                                                           | PASS   | Exit 0.                                                                                                                                   |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                               | PASS   | 64 Rust tests passed; 0 failed.                                                                                                           |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets --all-features -- -D warnings` | PASS   | Exit 0 with warnings denied.                                                                                                              |
| `git diff --check`                                                                                                 | PASS   | No whitespace errors.                                                                                                                     |
| `pnpm tauri build --bundles app`                                                                                   | PASS   | Optimized arm64 binary and `PromptDock.app` generated.                                                                                    |
| `codesign --verify --deep --strict`                                                                                | PASS   | The accepted app, DMG-mounted app, and independently extracted app ZIP are valid on disk and satisfy their designated ad-hoc requirement. |
| `hdiutil verify …PromptDock_1.1.0_aarch64.dmg`                                                                     | PASS   | Final checksum is valid, CRC32 `$612246F5`.                                                                                               |
| `unzip -t …PromptDock_1.1.0_aarch64_app.zip`                                                                       | PASS   | ZIP integrity passed; the extracted app retained a valid deep signature.                                                                  |

The first sandboxed frontend test/build invocation could not write Vite's `node_modules/.vite-temp` and returned `EPERM`. The commands were immediately rerun with approved worktree write access and the complete suites passed; this was an execution-sandbox restriction, not a failed assertion.

## Automated behavior coverage

### Rust / SQLite

The 64 tests cover the original persistence/import scope plus the window-mode coordinator and native menu integration:

- first start, second start and exactly six default categories with zero prompts;
- validation and multiline/Unicode CRUD persistence;
- unknown categories, empty fields and configured length limits;
- Chinese substring search and literal treatment of SQL LIKE `%` / `_`;
- views, sorting and successful copy-count updates;
- case-insensitive category uniqueness, rename and delete-with-move transactions;
- five-pin limit, manual order stability, compaction and legacy pin migration;
- settings JSON round-trip and zero-valued dashboard stats;
- current backup parsing, complete export/replace round-trip and all prompt fields;
- stable UUID v5 mapping for legacy IDs;
- malformed JSON, duplicate IDs, 10 MiB and 10,000-prompt limits;
- import rollback and mandatory pre-replace safety backup;
- native Edit menu ordering for Undo, Redo, Cut, Copy, Paste and Select All;
- serialized Main/Sticky transitions, idempotency, startup reconciliation and concurrent toggle decisions;
- compensation at every window/settings failure point without leaking unsanitized errors;
- zero-window recovery, explicit close persistence, always-on-top persistence and saved-position handling;
- startup restoration for both persisted modes and monitor-aware sticky-position clamping;
- strict deserialization of the narrowed sticky-settings patch.

### Vue / TypeScript

The 23 tests cover:

- native clipboard success/failure/statistics ordering;
- Unicode/deduplicated template variables, literal special characters, one-pass replacement, missing values and limits;
- import preview counts and merge default;
- five fixed sticky slots for an empty library;
- quick search 12-result limit, wrapping navigation, Escape and Chinese body filtering;
- prompt-card selection versus copy event separation;
- typed `enterStickyMode` / `enterMainMode` command contracts and removal of the legacy `showSticky` path;
- all three main-window sticky entry points using one guarded transition handler;
- sticky header/footer full-mode controls, explicit close behavior and duplicate-click suppression;
- pending, rejection and accessible live-region feedback without unhandled promise rejections.

## Native release smoke test

The accepted packaged release app, not the static HTML prototype, was launched from this repository-relative path:

```text
src-tauri/target/release/bundle/macos/PromptDock.app
```

### Current accepted-candidate observations — 2026-10-14

- main window opened the real SQLite-backed library with six categories and one existing prompt named `测试`;
- the native Edit menu contains Undo, Redo, Cut, Copy, Paste and Select All;
- title, tags, description and body accept multiline Unicode system-pasteboard text, including Chinese, `✓`, HTML-like characters, template braces and emoji;
- `Cmd+A`, `Cmd+C`, `Cmd+V`, `Cmd+X`, `Cmd+Z` and `Shift+Cmd+Z` visibly select, copy, paste, cut, undo and redo;
- sidebar, toolbar and pinned-panel entry points each leave only the sticky window visible;
- the sticky header icon and footer each leave only the focused main window visible;
- application-menu Open Main/Toggle and second-instance activation use the same exclusive transition path;
- explicitly closing sticky persists `visible:false`; a later macOS application activation recovers Main;
- six rapid alternating transitions ended in the requested exclusive mode every time;
- relaunch with persisted Main restores only Main, and relaunch with persisted Sticky restores only Sticky;
- sticky measures 680×540 Retina pixels at scale factor 2.0 (340×270 points), shows one populated slot plus four empty slots, and its always-on-top control toggles on and off;
- opening the `.app` a second time while Sticky was visible activated only Main through the single-instance path.

The populated new-prompt form used for clipboard/shortcut checks was discarded without saving; the existing `测试` prompt remained the only stored prompt.

### Prior native baseline retained — 2026-10-13

These observations remain valid evidence for their own scopes but were not rerun as part of the 2026-10-14 accepted-candidate interaction pass:

- a fresh-data run rendered an empty library with exactly six default categories;
- runtime information returned version 1.1.0, `Option+Space · 已注册` and the real DB path;
- the custom category dialog replaced unsupported browser `prompt()` behavior;
- quick search opened and Escape closed it;
- a second launch left exactly one PromptDock process (`process_count=1`).

Native drag-position preservation is `NOT_TESTED`: Computer Use drag attempts did not move the window, so only deterministic Rust position/startup tests cover it. VoiceOver spoken output is also `NOT_TESTED`; component tests cover the DOM/live-region lifecycle, but no spoken audio was observed.

Fresh read-only DB inspection after the 2026-10-14 native acceptance run:

```text
categories|6
prompts|1
app_settings|2
migrations|2
```

Database path:

```text
~/Library/Application Support/com.promptdock.local/promptdock.sqlite3
```

## Offline and security inspection

- No application `fetch`, `XMLHttpRequest`, HTTP client plugin, `reqwest`, business `localStorage`, `sessionStorage` or `v-html` use was found.
- Release CSP `connect-src` contains only Tauri IPC; localhost WebSocket/HTTP is isolated to `devCsp` for Vite HMR.
- Capabilities expose only the required window/event, clipboard and dialog operations; no shell, HTTP, updater or arbitrary filesystem command is shipped.
- SQL writes use SQLx bound parameters and transactions; UI input is revalidated in Rust.
- Clipboard writes full text through the official Tauri plugin and never performs automatic paste.

## Release artifacts

```text
App: src-tauri/target/release/bundle/macos/PromptDock.app
DMG: src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg
```

These repository-relative paths identify the exact accepted candidate that was signed, exercised, and used to create the verified DMG/App ZIP.

- App size: 7.14 MiB
- DMG size: 3,462,474 bytes
- App ZIP size: 3,453,725 bytes
- Binary: Mach-O 64-bit executable arm64
- DMG SHA-256: `c8ab1407e549ccb05e7117df5a6fde98dfb52a81943f24c30fbfbdfcc554645e`
- App ZIP SHA-256: `9ce66588204ae01255c2333633dd62a50a9e5f907f7d879fbddb621f7a9ed232`
- App metadata: version 1.1.0, bundle ID `com.promptdock.local`, minimum macOS 13.0
- Signing: complete local ad-hoc signature; no Developer ID/team and no Apple notarization

The Tauri `.app` build succeeded. The all-target bundle run's Finder AppleScript failed only while applying a cosmetic DMG layout on this macOS version. The final installer was regenerated directly from the exact accepted signed app with `hdiutil`; its mounted top level contains only `PromptDock.app` and the `/Applications` link, and both image integrity and the mounted app signature pass. The signed app ZIP also passes archive integrity and extracted-signature verification.
