# PromptDock macOS-native UI polish design

Date: 2026-10-14  
Status: User-approved design, pending spec review  
Target branch: `feat/promptdock-ui-native-polish`

## 1. Context

PromptDock UI V3 established the required workbench structure and real data paths, but its presentation layer still relies on native HTML controls, page-level hand-written CSS, simulated traffic-light decorations, and Unicode characters such as `⌂`, `☆`, `▢`, `▤`, `⚙`, `＋`, and `×` as icons. The result is functionally correct but visually inconsistent and too close to an unfinished web prototype.

The user selected a lightweight macOS desktop-tool direction instead of an Ant Design Vue or Element Plus administration-dashboard style. The user approved adding `reka-ui` and `lucide-vue-next` as local open-source dependencies.

## 2. Authority and constraints

This polish must preserve the existing product and data constraints:

1. `docs/product/PRD.md` remains authoritative for product scope and acceptance behavior.
2. The confirmed V3 structure remains authoritative for the 84 px rail, combined filter area, four real statistics, 44/56 list/detail workbench, category safety, and Sticky comfortable/compact densities.
3. Business data remains in `app_data_dir/promptdock.sqlite3`; the UI library must not introduce `localStorage` as a business store.
4. Rust commands remain the only data-operation API. No generic SQL IPC, remote API, telemetry, CDN, updater, AI SDK, or runtime font/icon fetch may be added.
5. Existing clipboard, copy-count, variable-template, Option+Space, JSON import/export, five-pin limit, pin ordering, window coordination, and cross-window refresh behavior must remain unchanged.
6. User content remains plain text. No `v-html` or executable template behavior may be introduced.
7. This is a presentation and interaction-component refactor. It requires no database migration.

## 3. Goals

- Replace character-based iconography with a consistent SVG icon system.
- Replace raw HTML form controls and hand-built overlay interactions where a focused headless primitive improves appearance, keyboard behavior, or accessibility.
- Establish a small PromptDock-owned UI component layer and token system.
- Make Main and Sticky feel like related macOS utility surfaces without pretending web controls are native AppKit widgets.
- Preserve all tested product behavior and real SQLite data paths.
- Keep bundle impact controlled through direct, tree-shakeable imports.

## 4. Non-goals

- Rewriting the app in SwiftUI or AppKit.
- Replacing Vue, Pinia, Tauri, or the Rust repository layer.
- Rebuilding the V3 information architecture.
- Adding dark mode, themes, plugin systems, animations for decoration, or Liquid Glass effects in this stage.
- Adopting Tailwind CSS, a full shadcn-vue distribution, Element Plus, Ant Design Vue, Vuetify, or another opinionated visual framework.
- Changing database schemas, command payloads, product copy rules, backup formats, or window-mode semantics.
- Making an unsigned/ad-hoc local build distributable outside the user's Mac.

## 5. Selected approach

Use a targeted headless-component architecture:

- `reka-ui` supplies interaction primitives for Dialog, Select, Tooltip, Popover/Dropdown where required, Toggle, and Switch. Its output is styled exclusively through PromptDock CSS and component wrappers.
- `lucide-vue-next` supplies direct-import SVG icons. Dynamic whole-library icon loading is prohibited so that unused icons remain tree-shakeable.
- PromptDock owns a thin `src/components/ui/` layer. Business windows and feature components depend on `Pd*` wrappers rather than scattering third-party APIs throughout the app.
- Existing CSS remains the build-time styling mechanism. Tailwind is not introduced.

The dependencies must be added through pnpm, locked in `pnpm-lock.yaml`, and bundled locally. The app must perform no runtime network request for styles, icons, or fonts.

## 6. Visual language

### 6.1 Typography

- UI text uses the macOS system stack: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text` fallback behavior, `Segoe UI`, `PingFang SC`, and sans-serif.
- Prompt bodies use `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, and monospace fallbacks.
- Use a compact type hierarchy rather than all-bold labels: window/section title, control label, body, metadata, and microcopy.

### 6.2 Color and surfaces

- Preserve the V3 blue-violet identity but reduce saturation for normal states.
- Define semantic tokens for page, sidebar, primary surface, elevated surface, hover, selected, border, primary text, secondary text, tertiary text, accent, accent-soft, success, warning, and danger.
- Use low-contrast 1 px separators. Avoid thick card outlines.
- Restrict strong shadows to overlays, popovers, and dialogs. Inline cards use subtle surface contrast and at most a shallow shadow.
- Keep Sticky's warm pale-yellow identity, but derive its borders and state colors from the same semantic token model.

### 6.3 Geometry and motion

- Standardize radii to 8, 10, 12, and 14 px roles.
- Standardize icon sizes to 14, 16, 18, and 20 px roles with a default stroke near 1.8 px.
- Control heights use a compact desktop scale rather than touch-first mobile metrics.
- State transitions last approximately 120–180 ms and affect only color, opacity, border, or small surface changes.
- Respect `prefers-reduced-motion` by removing nonessential transition duration.

### 6.4 Focus and input states

- All interactive controls expose visible `:focus-visible` treatment.
- Hover, pressed, selected, disabled, loading, error, and success states must be distinguishable without relying only on color.
- Icon-only buttons require an accessible name and Tooltip. Destructive actions retain explicit text where ambiguity would be unsafe.

## 7. PromptDock UI component layer

Create a deliberately small wrapper layer:

```text
src/components/ui/
  PdButton.vue
  PdIconButton.vue
  PdSelect.vue
  PdDialog.vue
  PdTooltip.vue
  PdToggle.vue
  PdBadge.vue
  PdSwitch.vue
  PdStatusMessage.vue
```

Responsibilities:

- `PdButton`: primary, secondary, ghost, and danger variants; leading/trailing icon slots; loading and disabled states.
- `PdIconButton`: consistent square metrics, focus state, accessible-name contract, and optional Tooltip.
- `PdSelect`: Reka Select composition, trigger, selected value, portal/content, scrollable option list, check mark, and keyboard navigation.
- `PdDialog`: Reka Dialog composition with overlay, focus management, title/description semantics, close behavior, and standardized content/footer slots.
- `PdTooltip`: delayed, noninteractive descriptions for compact icon controls; never the sole carrier of critical information.
- `PdToggle`: pressed-state filter chip for boolean filters.
- `PdBadge`: low-emphasis category/tag/status labels.
- `PdSwitch`: accessible binary setting such as Sticky always-on-top.
- `PdStatusMessage`: compact inline warning, error, and success feedback with icon and live-region support where needed.

Wrappers must remain presentation-focused. They must not import stores, Tauri APIs, repository types, or feature-specific commands.

## 8. Icon system

Replace Unicode UI glyphs with direct Lucide imports. Initial semantic mapping:

| Purpose | Icon |
| --- | --- |
| Workbench | `LayoutDashboard` |
| Favorites | `Star` |
| Category management | `FolderTree` |
| Sticky mode | `PanelsTopLeft` |
| Settings | `Settings` |
| Search | `Search` |
| Filter | `ListFilter` |
| Sort | `ArrowUpDown` |
| Pin | `Pin` / `PinOff` |
| Copy | `Copy`, then transient `Check` |
| Add | `Plus` |
| Edit | `Pencil` |
| Export | `Download` |
| Import | `Upload` |
| Close | `X` |
| Delete | `Trash2` |
| Reorder | `GripVertical` |
| Warning | `TriangleAlert` |
| Template/code | `Braces` |

Decorative characters may remain inside user content, but application controls and status indicators must not rely on character glyphs as icons.

## 9. Main window design

### 9.1 Native titlebar and rail

- Keep the real decorated macOS main window and its native traffic-light controls.
- Remove the simulated traffic-light group from the Vue rail.
- Retain the 84 px rail and compact brand, but reduce brand prominence relative to navigation.
- Use Lucide icons, 18 px default size, consistent hit targets, and `PdTooltip` for names/shortcuts.
- Selected rail items use a soft accent capsule plus an explicit semantic pressed/current state.
- The rail settings action remains anchored at the bottom.

### 9.2 Search and filters

- Retain the one-row combined filter requirement at supported desktop widths.
- Search is the visually dominant control, with `Search` and the `⌘K` hint.
- Category and tag use `PdSelect`.
- Favorite, pinned, recent-use, and template-only filters become `PdToggle` chips with icon and short text.
- Sort uses a compact `PdSelect` or menu with `ArrowUpDown`.
- Clear-filters appears only while at least one nondefault filter is active.
- Existing `PromptQuery` patches and Rust query semantics stay unchanged.

At the 1024 px minimum width, controls may reduce label padding and width, but must not overflow horizontally or collapse into an undocumented second workflow.

### 9.3 Dashboard statistics

- Keep four cards and their real values.
- Each card uses a semantic icon well, compact label, prominent number, and low-contrast surface.
- The pin card may include a small 0–5 capacity indicator, but the textual `n/5` remains available to assistive technology.
- Cards do not become navigation unless an existing action explicitly requires it.

### 9.4 Prompt list

- Present rows as a continuous macOS-style source list, not disconnected web cards.
- Selected rows use a soft accent background and a 2 px leading indicator.
- Keep title, excerpt, category, tags, and usage metadata with clearer type hierarchy.
- Replace favorite, pin, and copy glyphs with accessible icon buttons.
- Row actions become visually stronger on hover/focus while staying keyboard reachable at all times.
- A successful copy briefly replaces `Copy` with `Check`; failure uses the existing error path and never reports success.
- Empty, loading, and error states use the shared icon and button language.

### 9.5 Prompt detail

- Keep the fixed detail pane and its current actions.
- Use a stable detail toolbar so action placement does not shift with long content.
- Copy remains the primary action; edit, new, and export are secondary.
- Show invalid-variable warnings through `PdStatusMessage` with `TriangleAlert`.
- Render prompt body as plain text in a reading surface using the defined monospace stack.

### 9.6 Status bar

- Keep offline/SQLite status and management/import/backup entries.
- Replace text separators with spacing and small icon-labelled actions.
- The bar remains low emphasis and does not compete with prompt actions.

## 10. Dialog and overlay design

Migrate category management, guarded category deletion, runtime information, import preview, and other compatible in-app overlays to the shared Dialog shell where doing so does not alter native file-dialog or native warning behavior.

- Use Reka Dialog for focus lock, accessible title/description, `Esc`, and overlay semantics.
- Preserve dirty-state confirmation behavior; do not make backdrop click silently discard work.
- Category rows use a real color swatch and `Folder` rather than `▢`.
- Rename and delete controls use Lucide icons plus labels or Tooltips as appropriate.
- Delete-with-transfer retains explicit source, target, prompt count, and destructive confirmation wording.
- The final-category guard remains enforced in Rust and represented through a disabled UI state with explanatory text.
- Native Tauri file dialogs and OS confirmations stay native and are not replaced merely for visual consistency.

## 11. Sticky window design

- Preserve independent native window behavior, five slots, manual pin order, system clipboard, and both saved densities.
- Preserve comfortable 420×695 points and compact 340×270 points exactly.
- Remove nonfunctional decorative traffic lights from the undecorated Sticky titlebar.
- Keep a clear draggable title region and functional icon actions for settings, return-to-Main, and hide.
- Replace card glyphs with semantic Lucide icons. Use `GripVertical` for order affordance and `Copy`/`Check` for copy state.
- Comfortable mode retains title and up to two description lines.
- Compact mode retains five title rows and its footer without clipping.
- Replace the hand-built always-on-top toggle with `PdSwitch` while preserving the existing setting command and rollback behavior.
- The settings layer uses the shared Dialog visual language but remains sized for the Sticky window.

## 12. Data flow and behavior preservation

The UI polish must be behaviorally transparent:

```text
User control
  → PromptDock Pd* wrapper / feature component
  → existing emitted event or store method
  → existing typed command API
  → Rust command
  → shared SqlitePool / native window or clipboard service
```

No business decision moves into the `Pd*` layer. Existing error levels, copy-before-count ordering, category transactions, pin limit, and window rollback behavior remain unchanged.

## 13. Accessibility requirements

- Reka Select and Dialog keyboard/focus behavior must not be bypassed by CSS or custom click handlers.
- Icon-only controls require `aria-label` and visible Tooltip text.
- Current route/rail state uses appropriate `aria-current` or pressed state.
- Toggle filters expose their on/off state programmatically.
- Dialogs have labelled title and optional description.
- Copy/status feedback uses a polite live region; blocking errors use alert semantics.
- Focus must return to the trigger when an overlay closes, unless the trigger no longer exists.
- Reduced-motion users receive no nonessential animation.
- A manual VoiceOver pass remains required before calling the native accessibility scope complete.

## 14. Testing strategy

### 14.1 Dependency and source checks

- `package.json` and `pnpm-lock.yaml` contain the two approved dependencies.
- Direct Lucide imports are used; no runtime icon CDN or dynamic whole-catalog import.
- Source audit finds no remaining Unicode glyphs used as application control icons in the refactored V3 surfaces.

### 14.2 Component tests

- `PdButton` variants, disabled/loading behavior, and icon slots.
- `PdIconButton` accessible-name requirement and Tooltip rendering.
- `PdSelect` open/select/keyboard behavior and emitted value.
- `PdDialog` title semantics, Escape handling, focus behavior, and guarded outside-close behavior.
- `PdToggle` pressed state and filter patch emission.
- `PdSwitch` accessible state and existing settings-command integration.

### 14.3 Feature regression tests

- Workbench filter composition and clearing.
- Category create/rename/delete-transfer behavior.
- Copy success/failure state without incorrect usage increments.
- Main/Sticky transitions.
- Sticky five-slot rendering in both densities.
- Existing import, export, editor, variable, quick-window, and window API tests.

### 14.4 Build and Rust gates

- `pnpm format:check`
- `pnpm typecheck`
- `pnpm vitest run`
- `pnpm build`
- `cargo fmt --check`
- `cargo test`
- `cargo clippy --locked --offline --all-targets --all-features -- -D warnings`
- `git diff --check`
- `pnpm tauri build --bundles app`
- `codesign --verify --deep --strict` on the local app bundle after any required ad-hoc re-signing

### 14.5 Native macOS acceptance

- Main at the 1360×860 default and 1024×700 minimum size.
- One-row filters and popover clipping against window edges.
- Keyboard traversal and Escape behavior for Select, Tooltip, and Dialog.
- Category management with the real category rows but without destructive mutation unless dedicated test data is used.
- Sticky comfortable and compact point dimensions and five-slot fit.
- Main → Sticky → Main exclusivity.
- No runtime network connection for UI assets.
- VoiceOver observation is reported separately and must remain `UNVERIFIED_MACOS_RUNTIME` if not performed.

## 15. Acceptance criteria

The polish is accepted when:

1. No V3 application control uses the identified Unicode characters as its icon.
2. Main uses the real macOS traffic lights without a second simulated set in the Vue content.
3. Rail, filters, statistics, prompt list, detail toolbar, category dialogs, and Sticky use the shared icon and token language.
4. Raw category/tag selects and compatible hand-built dialogs are replaced by PromptDock wrappers backed by Reka primitives.
5. The 1024×700 Main minimum and both Sticky densities render without clipping or horizontal overflow.
6. All existing product behavior and database invariants remain unchanged.
7. Approved dependencies are locked and bundled locally with no runtime network request.
8. Automated gates pass, a macOS `.app` is built, and native observations are recorded conservatively.

## 16. Risks and mitigations

- **Portal behavior inside Tauri WebView:** Verify Reka portal layering, focus, and CSP behavior early with a minimal Select/Dialog test.
- **Bundle growth:** Use direct imports, inspect production bundle output, and avoid installing a broader visual framework.
- **Snapshot/test brittleness:** Prefer roles, labels, and `data-test` selectors over SVG markup or generated DOM structure.
- **Minimum-width overflow:** Validate the complete filter row at 1024 px before polishing secondary surfaces.
- **Sticky density regression:** Treat 420×695 and 340×270 as hard contracts and keep explicit component/native tests.
- **Third-party visual leakage:** All application code consumes PromptDock wrappers and semantic tokens; default library styling is not imported.
- **Accidental behavior refactor:** Do not change Rust commands, database migrations, or business-event contracts in this stage.

## 17. Delivery boundaries

Deliver the change as reviewable commits on `feat/promptdock-ui-native-polish`, with dependencies/token foundations first, Main workbench second, overlays third, Sticky fourth, and verification last. Do not push, merge, or rebase into `main` without explicit user authorization.
