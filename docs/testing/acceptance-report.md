# PromptDock Native UI Polish Acceptance Addendum

Test date: 2026-10-15 (Asia/Shanghai)

Candidate: branch `feat/promptdock-ui-native-polish`, application source through commit `3c4ea51` (`refactor: complete native UI component migration`). The report commit, if present, is documentation-only and later than the tested application source.

Environment: macOS 26.4.1 (25E253), Apple Silicon arm64, Node 25.6.0, pnpm 10.34.5, Rust/Cargo 1.92.0, Tauri CLI 2.12.2, PromptDock 1.1.1.

## Native UI polish delivered scope

- The application now uses repository-locked `reka-ui@2.11.0` interaction primitives and `lucide-vue-next@1.0.0` icons through PromptDock-owned wrappers. It does not load a UI framework, icon set, font, or other asset from a CDN at runtime.
- Main, Quick, Sticky, editor, import preview, variable input, category management, shared dialogs/selects/tooltips/status feedback, and retained prompt card/detail components use one restrained macOS-oriented visual language. Simulated traffic lights and production Unicode action glyphs were removed; genuine keyboard hints and the `340 × 270` size label remain text.
- The Main workbench's compact CSS contract keeps all search/filter controls visible on one row at the 1024×700 design target by reducing widths, gaps, and padding without replacing the desktop workflow or hiding filters. The configured 1360×860 native view was observed; the exact 1024×700 native resize boundary is recorded separately as unverified.
- Existing SQLite, clipboard, copy-statistics, template, category-safety, five-pin, native-window, density, and latest-intent behavior remain the product contract. This pass adds no account, network, cloud, telemetry, updater, model, or automatic-paste behavior.

## Native UI polish automated gates

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm format:check` | PASS | Prettier 3.9.10 reported all matched files formatted. |
| `pnpm typecheck` | PASS | `vue-tsc --noEmit`, exit 0. |
| `pnpm vitest run` | PASS | 18 files, 220 tests passed; 0 failed. |
| `pnpm build` | PASS | Vite 8.3.4 transformed 2,429 modules; HTML 0.59 kB (0.41 kB gzip), CSS 56.51 kB (11.25 kB gzip), JS 302.63 kB (101.35 kB gzip). |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS | Exit 0. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS | 74 Rust tests passed; 0 failed; binary and documentation test targets also passed. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets --all-features -- -D warnings` | PASS | Exit 0 with warnings denied. |
| `git diff --check` | PASS | No whitespace errors before the report update. |
| `pnpm tauri build --bundles app` | PASS | Release binary and macOS `.app` generated; Tauri reported 7.24 MiB. |
| `codesign --verify --deep --strict` | PASS after generated-artifact repair | The first verification exited 1 with `code has no resources but signature indicates they must be present`. Per the plan, only the generated `.app` was ad-hoc re-signed with `codesign --force --deep --sign -`; the repeated strict verification exited 0. No source signing configuration changed. |

## Dependency and bundle evidence

- Direct production versions are `@tauri-apps/api@2.12.3`, clipboard plugin 2.4.2, dialog plugin 2.8.2, `vue@3.5.44`, `pinia@4.0.3`, `reka-ui@2.11.0`, and `lucide-vue-next@1.0.0`. `pnpm-lock.yaml` SHA-256 is `34678948a615e85ab52a9c2322c31a7789ec18119cc1d23dda62fdef3d4c906a`.
- Compared with the recorded V3 frontend baseline, CSS increased from 38.34 to 56.51 kB (+18.17 kB, +47.4%) and from 8.74 to 11.25 kB gzip (+2.51 kB, +28.7%). JavaScript increased from 125.96 to 302.63 kB (+176.67 kB, +140.3%) and from 45.18 to 101.35 kB gzip (+56.17 kB, +124.3%). This is the cumulative cost of the local Reka/Lucide implementation and PromptDock wrappers; Vite still tree-shakes direct component/icon imports.
- The generated application is `/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app`, is 7.2 MiB on disk, contains a thin arm64 Mach-O, and after the ad-hoc repair its executable SHA-256 is `1644438dcf95ea7ef0171b4f4f2630f0c45fff4cc1e83c7bcb3e78cd5ddec731`. There is no archived byte-identical pre-polish `.app` in this worktree, so no unsupported `.app` byte delta is claimed.

## Native UI polish database and offline evidence

- Read-only inspection of `/Users/qianduoduo/Library/Application Support/com.promptdock.local/promptdock.sqlite3` returned `categories=6`, `prompts=4`, `daily_copy_stats=0`, `migrations=3`, `pinned=4`, and `favorites=3`. Category prompt counts remained `0, 1, 0, 0, 0, 3` in their stored order. The aggregate lifetime `copy_count` remained 8 before and after the native interaction pass, and final Sticky settings reported `density="comfortable"` and `visible=false`.
- The packaged executable was observed running from the repository bundle path. `lsof -a -p <packaged-process-pid> -i -n -P` returned no network descriptors. Production source inspection found no `fetch`, `XMLHttpRequest`, `WebSocket`, remote font/import, or HTTP URL in application TypeScript, Vue, CSS, or Rust sources; release CSP limits connections to Tauri IPC.
- No real prompt was copied and no prompt or category create, edit, delete, transfer, import, or export action was performed for this verification. The allowed Sticky density/window checks may update only local `sticky_window` settings.

## Native UI polish packaged macOS observations

- The exact repository bundle opened to the configured 1360×860-point Main window. Its Retina content capture measured 2720×1624 pixels after the 48-pixel native titlebar area. Real macOS close/minimize/zoom traffic lights were visible and no duplicate simulated lights appeared.
- At that size, the search and all filter controls remained on one row. All four live statistics (`total=4`, `todayCopies=0`, `favorites=3`, `pinned=4/5`), four prompt rows, and the selected prompt detail were visible without a replacement mobile workflow.
- `⌘K` opened the packaged Quick palette. Its accessibility tree exposed the search input, Escape hint, and direction-key hint; Escape closed it. No result was copied.
- The category Select was exercised from the keyboard: Shift+Tab and Return opened it, arrow-key selection applied the empty `技术研发` filter, and Return/Home/Return restored `全部分类`; a subsequent open/Escape closed without committing another choice. Main finished with all temporary filters cleared.
- Category management opened with focus on `新增分类`, displayed the safety explanation and all six real category rows with counts `0, 1, 0, 0, 0, 3`, and closed with Escape. No category or prompt was changed.
- Main → Sticky comfortable → compact → comfortable → Main completed in the packaged app. Retina captures measured 840×1390 pixels (420×695 points) for comfortable and 680×540 pixels (340×270 points) for compact. The accessibility tree exposed four pinned prompts plus empty slot 5 at both densities. Density was restored to `comfortable`; no prompt was copied.
- Runtime information displayed PromptDock 1.1.1, `Option+Space · 已注册`, and the exact application-data database path. This proves the Rust registration path reported success; foreground focus from another application was not exercised and remains unverified below.
- Shared icon-button focus treatment was visible during keyboard navigation. A hover Tooltip could not be observed reliably through the computer-use surface, so Tooltip runtime behavior is not promoted to PASS.
- Exact 1024×700 native resize could not be completed through the available native-window controls. Task 8 tests and static width budgeting remain supporting evidence, not a substitute for that native viewport check.

## Explicit verification boundaries

- `UNVERIFIED_MACOS_RUNTIME` — exact 1024×700 packaged-window layout, mouse-hover Tooltip display, actual Option+Space focus from another application, VoiceOver spoken output, real cross-application clipboard comparison, variable-template native copy, real drag-position restoration, multi-display clamping/Spaces, always-on-top against another app, live cross-window refresh after a real mutation, and destructive category transfer. Deterministic tests and implementation inspection are supporting evidence only for these scenarios.
- `UNVERIFIED_WINDOWS_RUNTIME` — Windows 10/11 x64 build and window frame, `Ctrl+K`, `Ctrl+Alt+Space`, display scaling, native clipboard, Narrator, Quick, and Sticky. No Windows runner was used.

## Native UI polish conclusion

Automated checks, the release build, strict post-repair signature verification, offline/read-only safety checks, the configured 1360×860 native Main view, keyboard Quick/Select/Dialog flows, and both Sticky densities passed. No P0/P1 failure was found. Final release status is **conditional pass** because the exact 1024×700 native viewport, hover Tooltip, Windows, accessibility, and other explicitly listed physical/system scenarios remain unverified.

---

# PromptDock UI V3 Acceptance Addendum

Test date: 2026-10-14 (Asia/Shanghai)

Candidate: branch `feat/promptdock-ui-v3-simplify`, application source through commit `92ce025` (`feat: add V3 sticky window densities`). The report commit, if present, is documentation-only and later than the tested application source.

Environment: macOS 26.4.1, Apple Silicon arm64, Node 25.6.0, pnpm 10.34.5, Rust/Cargo 1.92.0, PromptDock 1.1.1.

## V3 delivered scope

- The full window is one SQLite-backed workbench with an 84 px icon rail, combined search/filter controls, four real dashboard statistics, a scrollable 44% list pane, and a fixed 56% detail pane.
- Category management is reachable from the rail, list header, and category selector. It supports create, rename, and guarded delete-with-transfer. The repository prevents deletion of the final category and keeps prompt identity, body, tags, favorites, pin order, copy statistics, and timestamps unchanged during transfer.
- A sequential migration, `0003_daily_copy_stats.sql`, adds a local-date aggregate used for the real “today copies” statistic. Copy count and the daily aggregate are updated in one transaction.
- The independent native sticky window persists `comfortable` or `compact` density. Comfortable uses 420×695 points and shows up to two preview lines; compact uses 340×270 points and keeps five title rows. Density resize and settings persistence are compensated together on failure.
- Existing SQLite CRUD, system clipboard orchestration, variable-template flow, quick window, Option+Space registration path, JSON import/export, five-pin limit, manual pin order, native window-mode coordination, and cross-window event refresh remain in place.

## V3 automated gates

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm format:check` | PASS | Prettier reported all matched files formatted. |
| `pnpm typecheck` | PASS | `vue-tsc --noEmit`, exit 0. |
| `pnpm vitest run` | PASS | 13 files, 45 tests passed; 0 failed. |
| `pnpm build` | PASS | 62 modules; CSS 38.34 kB (8.74 kB gzip), JS 125.96 kB (45.18 kB gzip). |
| `cargo fmt --check` | PASS | Exit 0. |
| `cargo test` | PASS | 74 Rust tests passed; 0 failed; doc tests passed. |
| `cargo clippy --locked --offline --all-targets --all-features -- -D warnings` | PASS | Exit 0 with warnings denied. |
| `git diff --check` | PASS | No whitespace errors. |
| `pnpm tauri build --bundles app` | PASS | Release binary and macOS `.app` generated. |
| `codesign --verify --deep --strict` | PASS | The V3 `.app` is valid on disk and satisfies its ad-hoc designated requirement. |

The initial browser-preview server attempt was denied by the execution sandbox with `listen EPERM`; it was rerun with the approved local `pnpm dev` permission. This was a sandbox restriction, not an application assertion failure.

## V3 database and safety evidence

- Repository tests compose category + tag + favorite + pinned + recent + template filters with bound values.
- Copy tests record two successful copies and assert both lifetime and same-day totals without changing unrelated dashboard counts.
- Tag tests prove distinct, sorted tag enumeration from JSON arrays.
- Category transfer tests move three prompts, compare every persisted field other than category, compare body bytes, and assert total prompt count is unchanged.
- Category error tests reject the final-category deletion, same source/target, and missing target.
- Density runtime tests prove comfortable/compact persistence and restore both saved settings and native size when native resize or settings persistence fails before or after mutation.
- Backward-compatibility deserialization proves existing `sticky_window` settings without a density field default to `comfortable`.
- Source inspection found no business `localStorage`, `BroadcastChannel`, `v-html`, remote API, telemetry, updater, or arbitrary SQL IPC path. The only `localStorage` match in application sources is the Vitest setup cleanup; localhost URLs are limited to the Tauri/Vite development configuration.
- `.superpowers/` remains an existing untracked user directory and was not staged or committed. No SQLite/DB file exists inside the repository.

## V3 visual and native observations

- The main workbench was rendered at 1280×720 in the local application frontend. The combined controls remained on one row, all four cards were visible, and the list/detail panes retained the requested split without horizontal overflow.
- After the Mac was unlocked, the exact packaged V3 bundle was attached and the native main workbench was inspected against the real SQLite library. It showed the 84 px rail, one-row combined filters, real values `total=4`, `todayCopies=0`, `favorites=3`, and `pinned=4/5`, all four prompt rows, and the 44/56 list/detail split.
- The native category manager was opened from the V3 UI and inspected with its safety explanation plus all six real category rows and counts (`0, 1, 0, 0, 0, 3`). Create, rename, guarded-delete, and completion controls were visible. It was closed without mutating the user's categories or prompts.
- The independent native sticky window was opened from Main in comfortable density. Its Retina capture measured 840×1390 pixels at scale factor 2.0, exactly 420×695 points. Four real pinned prompts plus one empty slot, the yellow card treatment, descriptions, management/sort actions, and footer all fit without clipping.
- The native density control was used to switch to compact. Its Retina capture measured 680×540 pixels at scale factor 2.0, exactly 340×270 points; five title rows and the footer fit. Density was then restored to `comfortable`, and the sticky footer returned exclusively to Main.
- The native Main → Sticky → Main transition left only the selected application window visible at each step.
- The production `.app` was built at `/Users/qianduoduo/Desktop/AI_app/PromptDock/src-tauri/target/release/bundle/macos/PromptDock.app`, has a 7.2 MiB on-disk size, and contains a Mach-O arm64 executable. The executable SHA-256 observed during acceptance was `a74c109a4da03cafe1790a1e0b199bf75ae57e9e832c02d1e2ebf33f0a2d156a`.
- After replacing the previously running installed instance, the new bundle executable was observed running from the repository bundle path.
- Read-only inspection of the real app-data database after V3 launch returned `categories=6`, `prompts=4`, `daily_copy_stats=0`, and `migrations=3`. Existing sticky settings were successfully read as JSON containing `"density":"comfortable"`; no prompt/category mutation was performed for this inspection.

## V3 native items not fully exercised

Native attachment was initially delayed while the Mac was locked. After unlock, the packaged V3 Main, category manager, comfortable sticky, compact sticky, density restoration, and exclusive window transition were inspected successfully as listed above. The following narrower system-level scenarios remain explicitly `UNVERIFIED_MACOS_RUNTIME`, even where deterministic tests or prior-version observations exist:

- real drag-position restoration, multi-display clamping, Spaces behavior, and always-on-top against another application;
- cross-application clipboard comparison in Notes/VS Code, variable-template copy, and Option+Space foreground focus;
- live cross-window refresh after a real mutation;
- destructive category transfer through the native UI (intentionally not run against the user's four real prompts);
- VoiceOver spoken output.

These remaining scenarios are not presented as passed. The corresponding implementation and deterministic coverage are evidence only where the complete physical scenario was not performed.

## V3 conclusion

The requested V3 implementation, data migration, category safety invariants, native density contract, automated checks, release build, signature verification, non-destructive real-database startup check, and the listed packaged native UI observations all passed. There are no known P0/P1 implementation failures in the tested scope. Release status remains **conditional pass** pending the narrower system-level `UNVERIFIED_MACOS_RUNTIME` interaction checks listed above.

---

# PromptDock V1.1 Acceptance Report

Test date: 2026-10-14 (Asia/Shanghai)

Environment: macOS 26.4.1, Apple Silicon arm64, Tauri CLI 2.12.2, PromptDock 1.1.0, branch `fix/edit-menu-exclusive-window-modes-implementation`.

Status is deliberately conservative. `PASS` means the complete assertion was covered by a reproducible integration/unit test or by an observed native action. `NOT_TESTED` means the implementation exists but the exact end-to-end manual scenario was not exercised; partial evidence is listed and is not promoted to a pass.

| ID    | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 | PASS       | The 2026-10-14 native run used an existing library and correctly showed six categories plus its one existing `测试` prompt (`categories=6`, `prompts=1`). AT-01's fresh-library condition is proven by repository first/second-start tests that assert exactly six defaults and zero prompts; the earlier 2026-10-13 fresh-data native baseline also showed that empty state. |
| AT-02 | PASS       | Rust integration test creates a prompt containing exact multiline/indented text, closes and reopens the database, then compares the persisted body.                                                                                                                                                                                                                           |
| AT-03 | NOT_TESTED | Clipboard orchestration unit tests prove native write precedes usage recording, but exact cross-app paste into Notes/VS Code was not performed with a real prompt.                                                                                                                                                                                                            |
| AT-04 | PASS       | Repository integration covers independent favorite/pin fields, persisted rows and filtered views.                                                                                                                                                                                                                                                                             |
| AT-05 | PASS       | Rust query test matches a Chinese body substring and escapes literal `%`/`_`; Vue quick-palette Chinese filtering test passed.                                                                                                                                                                                                                                                |
| AT-06 | NOT_TESTED | The 2026-10-13 native baseline reported `Option+Space · 已注册`; the exact Safari/VS Code foreground focus scenario was not exercised.                                                                                                                                                                                                                                        |
| AT-07 | PASS       | Quick-palette tests cover the 12-result cap and wrapping arrow selection; in the 2026-10-13 native baseline the quick panel opened from Main and `Esc` closed it.                                                                                                                                                                                                             |
| AT-08 | PASS       | Template tests cover duplicate Unicode variables, one-pass literal replacement, `$&`, backslashes, braces, missing values and the 30-variable limit.                                                                                                                                                                                                                          |
| AT-09 | NOT_TESTED | The editor uses a native warning confirmation for dirty close, but the complete dirty-edit/Esc sequence was not manually exercised.                                                                                                                                                                                                                                           |
| AT-10 | NOT_TESTED | Export/import round-trip and merge transaction code are covered, but the exact native-dialog sequence “export → delete → merge restore” was not exercised.                                                                                                                                                                                                                    |
| AT-11 | PASS       | Backup parser tests reject malformed JSON, duplicate IDs, files over 10 MiB and more than 10,000 prompts; rollback test proves no partial writes.                                                                                                                                                                                                                             |
| AT-12 | NOT_TESTED | Source/config inspection found no application network client or remote business dependency, and release CSP blocks network connections; a full workflow with the Mac network physically disabled was not performed.                                                                                                                                                           |
| AT-13 | PASS       | The 2026-10-13 native baseline measured `process_count=1` after a second launch. In the 2026-10-14 run, a second launch while Sticky was visible activated only Main through the single-instance path.                                                                                                                                                                        |
| AT-14 | PASS       | Clipboard unit test forces native-write failure and verifies usage recording is not called and success is not reported.                                                                                                                                                                                                                                                       |
| AT-15 | NOT_TESTED | Committed records persist across DB reopen in integration tests; the exact force-terminate-and-reopen desktop scenario was not exercised.                                                                                                                                                                                                                                     |
| AT-16 | PASS       | Legacy parser test maps non-UUID IDs deterministically and preserves legacy data for import; repeat parsing produces the same UUIDs.                                                                                                                                                                                                                                          |
| AT-17 | PASS       | Each of the three Main entry points hid Main and displayed only the independent sticky window; the native Retina capture measured 680×540 pixels at scale factor 2.0 (340×270 points). Header/footer transitions returned to Main exclusively.                                                                                                                                |
| AT-18 | NOT_TESTED | The 2026-10-14 native view showed exactly five slots: one populated with `测试` and four empty. Component tests cover the zero-pin five-empty-slot state and repository tests cover four/five-slot compaction, but the 0/4/5 populated visual states and a long copied title were not manually exercised.                                                                     |
| AT-19 | NOT_TESTED | Repository test rejects a sixth pin with `PIN_LIMIT_REACHED` and succeeds after unpinning, but preservation of an unsaved editor body in that exact UI path was not exercised.                                                                                                                                                                                                |
| AT-20 | PASS       | Transactional repository test reverses all five pins, records copy usage, and proves displayed pin order stays unchanged; compact pin-order constraints are asserted.                                                                                                                                                                                                         |
| AT-21 | NOT_TESTED | Sticky row uses the shared full-body native clipboard service and does not close on copy, but exact Notes/VS Code comparison was not exercised.                                                                                                                                                                                                                               |
| AT-22 | PASS       | Template validation rejects missing fields and never returns unresolved source; sticky template action routes into the required variable flow.                                                                                                                                                                                                                                |
| AT-23 | NOT_TESTED | The native always-on-top control visibly toggled on and back off, and deterministic tests cover position persistence/clamping. Real drag-position restoration and external-display unplug recovery were not physically exercised, so the complete acceptance case remains unpassed.                                                                                           |
| AT-24 | NOT_TESTED | DB pin operations are transactional and cross-window `prompts-changed` re-querying is wired; a manual concurrent edit/delete/unpin session was not exercised.                                                                                                                                                                                                                 |
| AT-25 | PASS       | Release CSP permits only Tauri IPC, source contains no fetch/HTTP client or automatic paste/send path, capabilities omit shell/HTTP/accessibility permissions, and the native sticky window runs from packaged local assets.                                                                                                                                                  |

## Current accepted-candidate native observations — 2026-10-14

- Main rendered the real SQLite-backed library with all six categories and its one existing prompt named `测试`; the fresh read-only query returned `categories=6`, `prompts=1`, `app_settings=2`, `migrations=2`.
- The native Edit menu exposed Undo, Redo, Cut, Copy, Paste and Select All. Title, tags, description and body accepted multiline Unicode clipboard content; `Cmd+A/C/V/X/Z` and `Shift+Cmd+Z` produced visible results.
- Sidebar, toolbar and pinned-panel transitions each left only sticky visible. The sticky header icon and footer each returned to only the focused Main window.
- Application-menu Open Main/Toggle and second-instance activation followed the exclusive coordinator path.
- Explicit sticky close persisted `visible:false`; later macOS application activation recovered Main from the zero-window state.
- Six rapid alternating transitions ended in the requested mode every time. Relaunch restored only Main from persisted Main and only Sticky from persisted Sticky.
- Sticky measured 680×540 Retina pixels at scale factor 2.0 (340×270 points), displayed one populated slot plus four empty slots, and its always-on-top control toggled on and back off.
- A second launch while Sticky was visible activated only Main through the single-instance path.
- The populated new-prompt form used for clipboard/shortcut checks was discarded without saving; the existing `测试` prompt remained the only stored prompt.

## Prior native baseline retained — 2026-10-13

The following earlier observations remain evidence for their own acceptance scopes but were not rerun in the 2026-10-14 interaction pass:

- A fresh-data run rendered the approved dark sidebar, an empty-state library and exactly six default categories.
- Runtime information showed version `1.1.0`, the registered global shortcut and the exact DB path.
- The custom category dialog focused its input and disabled empty submission; no unsupported browser `prompt()` remained.
- Quick search displayed as a focused native window and closed with Escape.
- A second launch left exactly one PromptDock process (`process_count=1`).

## Window-mode items not observed

- `NOT_TESTED` — real drag-position preservation after moving the native sticky window. Computer Use drag attempts did not move it; deterministic Rust tests are the available evidence.
- `NOT_TESTED` — VoiceOver spoken output. Component tests cover focus and live-region lifecycle, but VoiceOver audio was not observed.
- Existing `NOT_TESTED` acceptance cases above remain unchanged where the exact full scenario was not exercised; automated coverage is not presented as native observation.

## Conclusion

The automated gates and the explicitly listed native window-mode/editing observations passed, and there are no known P0 code defects. Overall release status remains **conditional pass** because several hardware/other-application manual scenarios are explicitly `NOT_TESTED`, especially external-editor clipboard comparison, other-app global shortcut focus, force termination, native drag-position restoration, multi-display recovery and VoiceOver speech.
