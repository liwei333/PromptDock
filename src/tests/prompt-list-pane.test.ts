// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PromptListPane from "@/components/PromptListPane.vue";
import type { Prompt } from "@/types/prompt";

const globalCss = readFileSync(resolve("src/styles/global.css"), "utf8");

const prompt: Prompt = {
  id: "prompt-1",
  title: "Codex 执行反馈模板",
  description: "用于结构化回传执行结果",
  body: "完整正文",
  categoryId: "category-1",
  categoryName: "开发工具",
  tags: ["Codex", "Agent"],
  isFavorite: true,
  isPinned: true,
  pinOrder: 1,
  copyCount: 26,
  lastCopiedAt: 2,
  createdAt: 1,
  updatedAt: 2,
};

describe("PromptListPane", () => {
  it("uses the specified two-pixel selected-row indicator", () => {
    expect(globalCss).toMatch(
      /\.v3-prompt-row\.selected\s*\{[^}]*box-shadow:\s*inset 2px 0 var\(--pd-accent\)/s,
    );
  });

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

  it("uses table selection semantics with an independent row selection button", async () => {
    const wrapper = mount(PromptListPane, {
      props: { prompts: [prompt], selectedId: prompt.id, total: 1 },
    });

    expect(wrapper.get(".v3-prompt-list").attributes("role")).toBe("table");
    const row = wrapper.get(".v3-prompt-row.selected[aria-selected='true']");
    expect(row.classes()).toContain("selected");
    expect(row.attributes("role")).toBe("row");
    expect(row.attributes("aria-selected")).toBe("true");
    expect(
      Array.from(row.element.children).every(
        (child) => child.getAttribute("role") === "cell",
      ),
    ).toBe(true);
    expect(row.text()).toContain(prompt.title);
    expect(row.text()).toContain("开发工具");
    expect(row.text()).toContain("复制 26 次");

    await wrapper.get("[data-test='list-copy']").trigger("click");
    await wrapper.get("[data-test='list-favorite']").trigger("click");
    await wrapper.get("[data-test='list-pin']").trigger("click");
    expect(wrapper.emitted("select")).toBeUndefined();

    const select = wrapper.get<HTMLButtonElement>(
      "[data-test='prompt-row-select']",
    );
    expect(select.element.tagName).toBe("BUTTON");
    expect(select.attributes("aria-label")).toBe(`选择提示词：${prompt.title}`);
    expect(select.element.tabIndex).toBe(0);
    await select.trigger("click");
    await select.trigger("keydown", { key: "Enter" });
    await select.trigger("keydown", { key: " " });
    await row.trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [prompt],
      [prompt],
      [prompt],
      [prompt],
    ]);
    expect(wrapper.emitted("copy")).toEqual([[prompt]]);
    expect(wrapper.emitted("favorite")).toEqual([[prompt]]);
    expect(wrapper.emitted("pin")).toEqual([[prompt]]);
  });

  it("renders labelled keyboard-reachable SVG actions without application glyphs", () => {
    const wrapper = mount(PromptListPane, {
      props: { prompts: [prompt], selectedId: null, total: 1 },
    });

    const favorite = wrapper.get<HTMLButtonElement>(
      "[data-test='list-favorite']",
    );
    const pin = wrapper.get<HTMLButtonElement>("[data-test='list-pin']");
    const copy = wrapper.get<HTMLButtonElement>("[data-test='list-copy']");
    const applicationControls = [favorite, pin, copy];

    expect(copy.attributes("aria-label")).toBe("复制提示词");
    expect(copy.element.tabIndex).toBe(0);
    expect(
      applicationControls.every((control) => control.find("svg").exists()),
    ).toBe(true);
    expect(
      applicationControls.map((control) => control.text()).join(""),
    ).not.toMatch(/[☆★▣⌁⌖{}]/u);
  });

  it("shows copied success independently from the pending copy state", async () => {
    const wrapper = mount(PromptListPane, {
      props: {
        prompts: [prompt],
        selectedId: prompt.id,
        total: 1,
        copyingId: prompt.id,
        copiedId: null,
      },
    });

    const pendingCopy = wrapper.get("[data-test='list-copy']");
    expect(pendingCopy.attributes("disabled")).toBeDefined();
    expect(pendingCopy.attributes("aria-busy")).toBe("true");
    expect(pendingCopy.attributes("aria-label")).not.toBe("已复制");

    await wrapper.setProps({ copyingId: null, copiedId: prompt.id });

    const copied = wrapper.get("[data-test='list-copy']");
    expect(copied.attributes("disabled")).toBeUndefined();
    expect(copied.attributes("aria-label")).toBe("已复制");
  });

  it("keeps existing rows during background loading and exposes non-destructive errors", async () => {
    const wrapper = mount(PromptListPane, {
      props: {
        prompts: [prompt],
        selectedId: prompt.id,
        total: 1,
        loading: true,
        error: "后台刷新失败",
        copiedId: prompt.id,
      },
    });

    const table = wrapper.get(".v3-prompt-list");
    expect(table.attributes("aria-busy")).toBe("true");
    expect(
      wrapper.get("[data-test='list-copy']").attributes("aria-label"),
    ).toBe("已复制");
    expect(
      wrapper.get("[data-test='list-refresh-error']").attributes("role"),
    ).toBe("alert");
    expect(wrapper.text()).toContain("后台刷新失败");

    await wrapper.get("[data-test='list-refresh-retry']").trigger("click");
    expect(wrapper.emitted("retry")).toEqual([[]]);
  });

  it("exposes category management, new prompt, and empty-state actions", async () => {
    const wrapper = mount(PromptListPane, {
      props: { prompts: [], selectedId: null, total: 0 },
    });

    await wrapper.get("[data-test='list-manage-categories']").trigger("click");
    await wrapper.get("[data-test='list-new-prompt']").trigger("click");

    expect(wrapper.text()).toContain("没有符合条件的提示词");
    expect(wrapper.emitted("manage-categories")).toHaveLength(1);
    expect(wrapper.emitted("new")).toHaveLength(1);
  });
});
