# PromptDock V1.1 Acceptance Report

Test date: 2026-10-14 (Asia/Shanghai)

Environment: macOS 26.4.1, Apple Silicon arm64, Tauri CLI 2.12.2, PromptDock 1.1.0, branch `fix/edit-menu-exclusive-window-modes-implementation`.

Status is deliberately conservative. `PASS` means the complete assertion was covered by a reproducible integration/unit test or by an observed native action. `NOT_TESTED` means the implementation exists but the exact end-to-end manual scenario was not exercised; partial evidence is listed and is not promoted to a pass.

| ID    | Status     | Evidence                                                                                                                                                                                                                                                                            |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 | PASS       | Native release app opened with six categories and an empty library. Real DB query returned `categories=6`, `prompts=0`, `migrations=2`. Repository first/second-start tests also passed.                                                                                            |
| AT-02 | PASS       | Rust integration test creates a prompt containing exact multiline/indented text, closes and reopens the database, then compares the persisted body.                                                                                                                                 |
| AT-03 | NOT_TESTED | Clipboard orchestration unit tests prove native write precedes usage recording, but exact cross-app paste into Notes/VS Code was not performed with a real prompt.                                                                                                                  |
| AT-04 | PASS       | Repository integration covers independent favorite/pin fields, persisted rows and filtered views.                                                                                                                                                                                   |
| AT-05 | PASS       | Rust query test matches a Chinese body substring and escapes literal `%`/`_`; Vue quick-palette Chinese filtering test passed.                                                                                                                                                      |
| AT-06 | NOT_TESTED | Native runtime reports `Option+Space · 已注册`; the exact Safari/VS Code foreground focus scenario was not exercised.                                                                                                                                                               |
| AT-07 | PASS       | Quick-palette test covers 12-result cap and wrapping arrow selection; native quick panel opened from the main app and `Esc` closed it.                                                                                                                                              |
| AT-08 | PASS       | Template tests cover duplicate Unicode variables, one-pass literal replacement, `$&`, backslashes, braces, missing values and the 30-variable limit.                                                                                                                                |
| AT-09 | NOT_TESTED | The editor uses a native warning confirmation for dirty close, but the complete dirty-edit/Esc sequence was not manually exercised.                                                                                                                                                 |
| AT-10 | NOT_TESTED | Export/import round-trip and merge transaction code are covered, but the exact native-dialog sequence “export → delete → merge restore” was not exercised.                                                                                                                          |
| AT-11 | PASS       | Backup parser tests reject malformed JSON, duplicate IDs, files over 10 MiB and more than 10,000 prompts; rollback test proves no partial writes.                                                                                                                                   |
| AT-12 | NOT_TESTED | Source/config inspection found no application network client or remote business dependency, and release CSP blocks network connections; a full workflow with the Mac network physically disabled was not performed.                                                                 |
| AT-13 | PASS       | Opening the release `.app` a second time left exactly one PromptDock process (`process_count=1`).                                                                                                                                                                                   |
| AT-14 | PASS       | Clipboard unit test forces native-write failure and verifies usage recording is not called and success is not reported.                                                                                                                                                             |
| AT-15 | NOT_TESTED | Committed records persist across DB reopen in integration tests; the exact force-terminate-and-reopen desktop scenario was not exercised.                                                                                                                                           |
| AT-16 | PASS       | Legacy parser test maps non-UUID IDs deterministically and preserves legacy data for import; repeat parsing produces the same UUIDs.                                                                                                                                                |
| AT-17 | PASS       | Each of the three Main entry points hid Main and displayed only the independent sticky window; the native Retina capture measured 680×540 pixels at scale factor 2.0 (340×270 points). Header/footer transitions returned to Main exclusively.                                      |
| AT-18 | NOT_TESTED | Native zero-pin view showed exactly five empty rows; repository tests cover four/five-slot compaction, but all 0/1/4/5 visual states and a long copied title were not manually exercised.                                                                                           |
| AT-19 | NOT_TESTED | Repository test rejects a sixth pin with `PIN_LIMIT_REACHED` and succeeds after unpinning, but preservation of an unsaved editor body in that exact UI path was not exercised.                                                                                                      |
| AT-20 | PASS       | Transactional repository test reverses all five pins, records copy usage, and proves displayed pin order stays unchanged; compact pin-order constraints are asserted.                                                                                                               |
| AT-21 | NOT_TESTED | Sticky row uses the shared full-body native clipboard service and does not close on copy, but exact Notes/VS Code comparison was not exercised.                                                                                                                                     |
| AT-22 | PASS       | Template validation rejects missing fields and never returns unresolved source; sticky template action routes into the required variable flow.                                                                                                                                      |
| AT-23 | NOT_TESTED | The native always-on-top control visibly toggled on and back off, and deterministic tests cover position persistence/clamping. Real drag-position restoration and external-display unplug recovery were not physically exercised, so the complete acceptance case remains unpassed. |
| AT-24 | NOT_TESTED | DB pin operations are transactional and cross-window `prompts-changed` re-querying is wired; a manual concurrent edit/delete/unpin session was not exercised.                                                                                                                       |
| AT-25 | PASS       | Release CSP permits only Tauri IPC, source contains no fetch/HTTP client or automatic paste/send path, capabilities omit shell/HTTP/accessibility permissions, and the native sticky window runs from packaged local assets.                                                        |

## Native observations

- Main window rendered the approved dark sidebar, empty-state library and all six default categories from the real SQLite database.
- Runtime dialog showed version `1.1.0`, registered global shortcut and the exact DB path.
- The custom category dialog focused its input and disabled submission for an empty name; no unsupported browser `prompt()` remained.
- Quick search displayed as a focused modal window and closed with Escape.
- Sticky mode displayed a pale-yellow 340×270 native window with five fixed empty slots and its top/manage/hide controls.
- The app remained single-instance after a second launch request.
- The native Edit menu exposed Undo, Redo, Cut, Copy, Paste and Select All. Title, tags, description and body accepted multiline Unicode clipboard content; `Cmd+A/C/V/X/Z` and `Shift+Cmd+Z` produced visible results.
- Sidebar, toolbar and pinned-panel transitions each left only sticky visible. The sticky header icon and footer each returned to only the focused Main window.
- Application-menu Open Main/Toggle and second-instance activation followed the exclusive coordinator path.
- Explicit sticky close persisted `visible:false`; later macOS application activation recovered Main from the zero-window state.
- Six rapid alternating transitions ended in the requested mode every time. Relaunch restored only Main from persisted Main and only Sticky from persisted Sticky.
- Sticky measured 680×540 Retina pixels at scale factor 2.0 (340×270 points), displayed exactly five slots, and its always-on-top control toggled on and back off.

## Window-mode items not observed

- `NOT_TESTED` — real drag-position preservation after moving the native sticky window. Computer Use drag attempts did not move it; deterministic Rust tests are the available evidence.
- `NOT_TESTED` — VoiceOver spoken output. Component tests cover focus and live-region lifecycle, but VoiceOver audio was not observed.
- Existing `NOT_TESTED` acceptance cases above remain unchanged where the exact full scenario was not exercised; automated coverage is not presented as native observation.

## Conclusion

The automated gates and the explicitly listed native window-mode/editing observations passed, and there are no known P0 code defects. Overall release status remains **conditional pass** because several hardware/other-application manual scenarios are explicitly `NOT_TESTED`, especially external-editor clipboard comparison, other-app global shortcut focus, force termination, native drag-position restoration, multi-display recovery and VoiceOver speech.
