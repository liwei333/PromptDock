# PromptDock V1.1 Verification Report

Tested 2026-10-13 on the environment recorded in `environment.md`.

## Final automated gates

| Command | Result | Evidence |
|---|---|---|
| `pnpm format:check` | PASS | Prettier: all matched files use Prettier style. |
| `pnpm typecheck` | PASS | `vue-tsc --noEmit`, exit 0. |
| `pnpm test:run` | PASS | Vitest 5.0.4: 6 files, 12 tests passed. |
| `pnpm build` | PASS | 56 modules; JS 126.69 kB (44.88 kB gzip), CSS 19.66 kB (4.87 kB gzip). |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS | Exit 0. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS | 19 Rust tests passed; 0 failed. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | PASS | Exit 0 with warnings denied. |
| `git diff --check` | PASS | No whitespace errors. |
| `pnpm tauri build --bundles app` | PASS | Optimized arm64 binary and `PromptDock.app` generated. |
| `codesign --verify --deep --strict` | PASS | Final app and the copy mounted from the DMG are valid on disk and satisfy their designated ad-hoc requirement. |
| `hdiutil verify …PromptDock_1.1.0_aarch64.dmg` | PASS | Final checksum is valid, CRC32 `$3A4DED24`. |

The first sandboxed Vitest/Cargo invocation could not write `.vite-temp` / `.cargo-lock` and returned `EPERM`. Both commands were immediately rerun with project-directory write access and the complete suites passed; this was an execution-sandbox restriction, not a failed assertion.

## Automated behavior coverage

### Rust / SQLite

The 19 tests cover:

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
- import rollback and mandatory pre-replace safety backup.

### Vue / TypeScript

The 12 tests cover:

- native clipboard success/failure/statistics ordering;
- Unicode/deduplicated template variables, literal special characters, one-pass replacement, missing values and limits;
- import preview counts and merge default;
- five fixed sticky slots for an empty library;
- quick search 12-result limit, wrapping navigation, Escape and Chinese body filtering;
- prompt-card selection versus copy event separation.

## Native release smoke test

The packaged release app, not the static HTML prototype, was launched from:

```text
/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app
```

Observed in the native Tauri process:

- main window loads the real SQLite-backed empty library and six categories;
- runtime information returns version 1.1.0, `Option+Space · 已注册` and the real DB path;
- the custom category dialog replaces unsupported browser `prompt()` behavior;
- quick search opens and Escape closes it;
- sticky mode opens as an independent 340×270 pale-yellow five-slot window;
- opening the `.app` a second time keeps one process only.

Actual DB inspection after native launch:

```text
categories|6
prompts|0
app_settings|2
migrations|2
```

Database path:

```text
/Users/qianduoduo/Library/Application Support/com.promptdock.local/promptdock.sqlite3
```

## Offline and security inspection

- No application `fetch`, `XMLHttpRequest`, HTTP client plugin, `reqwest`, business `localStorage`, `sessionStorage` or `v-html` use was found.
- Release CSP `connect-src` contains only Tauri IPC; localhost WebSocket/HTTP is isolated to `devCsp` for Vite HMR.
- Capabilities expose only the required window/event, clipboard and dialog operations; no shell, HTTP, updater or arbitrary filesystem command is shipped.
- SQL writes use SQLx bound parameters and transactions; UI input is revalidated in Rust.
- Clipboard writes full text through the official Tauri plugin and never performs automatic paste.

## Release artifacts

```text
App: /Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app
DMG: /Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/dmg/PromptDock_1.1.0_aarch64.dmg
```

- App size: 7.1 MiB
- DMG size: 3.6 MiB
- Binary: Mach-O 64-bit executable arm64
- DMG SHA-256: `fafcd60cd253ec1cf8fdc7281ef91751c6da2c1bbc6f9579099b0cba27de535c`
- App metadata: version 1.1.0, bundle ID `com.promptdock.local`, minimum macOS 13.0
- Signing: complete local ad-hoc signature; no Developer ID/team and no Apple notarization

The Tauri `.app` build succeeded. The all-target bundle run's Finder AppleScript failed only while applying a cosmetic DMG layout on this macOS version. The final installer was regenerated from the final signed app with `hdiutil`, includes the app, `/Applications` link and volume icon, and passes both image-integrity and embedded-app signature verification.
