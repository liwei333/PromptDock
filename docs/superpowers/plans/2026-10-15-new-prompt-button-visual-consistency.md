# New Prompt Button Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the list-header “新建提示词” button render exactly like the detail-pane “一键复制” primary button, with a blue surface and white icon/text.

**Architecture:** Keep both controls on the existing `PdButton` `primary` variant. Fix the presentation leak at its source by narrowing the list-header metadata selector so it no longer assigns a gray color to every descendant `span`, including `PdButton` internals.

**Tech Stack:** Vue 3, TypeScript, scoped Vue components, semantic CSS tokens, Vitest, Vue Test Utils.

**Design authority:** `docs/superpowers/specs/2026-10-15-new-prompt-button-rest-state-design.md`

**Required practices:** Use `@test-driven-development` for the regression, `@ui-styling` for the visual-state decision, and `@verification-before-completion` before reporting completion.

---

## File structure and responsibilities

- Modify `src/tests/prompt-list-pane.test.ts` — guard the primary-button contract and prevent broad header selectors from recoloring button internals.
- Modify `src/styles/global.css` — scope the gray metadata color and font size to `.prompt-list-sort` only.

No Vue behavior, shared `PdButton` implementation, dependency, Rust command, database, or window-management file should change.

---

### Task 1: Reproduce and fix the header style leak

**Files:**
- Modify: `src/tests/prompt-list-pane.test.ts`
- Modify: `src/styles/global.css:1790-1818`

- [x] **Step 1: Write the failing regression test**

Add this test inside `describe("PromptListPane", ...)`:

```ts
it("keeps the new-prompt primary button out of header metadata styling", () => {
  const wrapper = mount(PromptListPane, {
    props: { prompts: [prompt], selectedId: prompt.id, total: 1 },
  });

  const newPrompt = wrapper.get("[data-test='list-new-prompt']");
  expect(newPrompt.attributes("data-variant")).toBe("primary");
  expect(globalCss).not.toMatch(
    /\.prompt-list-pane\s*>\s*header\s+span\s*\{/,
  );
  expect(globalCss).toMatch(
    /\.prompt-list-sort\s*\{[^}]*color:\s*var\(--pd-text-tertiary\);[^}]*font-size:\s*9px;/s,
  );
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm vitest run src/tests/prompt-list-pane.test.ts
```

Expected: FAIL in the new test because `global.css` still contains `.prompt-list-pane > header span { ... }`; existing tests remain passing.

- [x] **Step 3: Apply the minimal selector fix**

In `src/styles/global.css`, replace the broad rule:

```css
.prompt-list-pane > header span {
  color: var(--pd-text-tertiary);
  font-size: 9px;
}
```

with the existing sort-specific rule carrying all four properties:

```css
.prompt-list-sort {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  color: var(--pd-text-tertiary);
  font-size: 9px;
}
```

The “新建提示词” control remains `variant="primary"`, so its internal label and Lucide `Plus` icon inherit white from `PdButton`; hover remains `--pd-accent-hover`, matching “一键复制”.

- [x] **Step 4: Run the targeted test and verify GREEN**

Run:

```bash
pnpm vitest run src/tests/prompt-list-pane.test.ts
```

Expected: PASS with all `PromptListPane` tests green.

- [x] **Step 5: Run the frontend quality gate**

Run:

```bash
pnpm format:check
pnpm typecheck
pnpm vitest run
pnpm build
git diff --check
```

Expected: every command exits 0; the full Vitest suite has zero failures; the production build completes without errors; the diff contains no whitespace errors.

- [x] **Step 6: Inspect the rendered state**

Open the Main window with at least one prompt and verify:

- “新建提示词” and “一键复制” both have the same blue default background.
- The plus icon and label are white at rest and on hover.
- Hover uses the same darker blue as “一键复制”.
- While pressed, both primary buttons keep white icon/text and use the shared 1px downward active feedback.
- “管理分类” and “最近使用” retain their low-emphasis appearance.
- Keyboard focus still shows the shared focus ring, and clicking “新建提示词” still opens the editor.

If a hover screenshot cannot be captured reliably, record that specific item as manual-only rather than claiming automation.

Execution note: native screenshots captured the rest, hover, active, and editor-open states. The exact “新建提示词” `focus-visible` ring could not be stably targeted through the macOS automation environment; the unchanged shared focus rule remains covered statically and this runtime evidence gap is reported explicitly.

- [x] **Step 7: Commit the implementation**

```bash
git add src/tests/prompt-list-pane.test.ts src/styles/global.css docs/superpowers/plans/2026-10-15-new-prompt-button-visual-consistency.md
git commit -m "fix: align new prompt primary button styling"
```

