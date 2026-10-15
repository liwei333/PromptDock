import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PromptListPane from "@/components/PromptListPane.vue";
import type { Prompt } from "@/types/prompt";

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
  it("uses listbox selection semantics and keeps row actions independent", async () => {
    const wrapper = mount(PromptListPane, {
      props: { prompts: [prompt], selectedId: prompt.id, total: 1 },
    });

    expect(wrapper.get(".v3-prompt-list").attributes("role")).toBe("listbox");
    const row = wrapper.get("[data-test='prompt-list-row']");
    expect(row.classes()).toContain("selected");
    expect(row.attributes("role")).toBe("option");
    expect(row.attributes("aria-selected")).toBe("true");
    expect(row.text()).toContain(prompt.title);
    expect(row.text()).toContain("开发工具");
    expect(row.text()).toContain("复制 26 次");

    await row.trigger("click");
    await row.trigger("keydown", { key: "Enter" });
    await wrapper.get("[data-test='list-copy']").trigger("click");
    await wrapper.get("[data-test='list-favorite']").trigger("click");
    await wrapper.get("[data-test='list-pin']").trigger("click");

    expect(wrapper.emitted("select")).toEqual([[prompt], [prompt]]);
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
