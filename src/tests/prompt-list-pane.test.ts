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
  it("renders selectable V3 rows and keeps row actions independent", async () => {
    const wrapper = mount(PromptListPane, {
      props: { prompts: [prompt], selectedId: prompt.id, total: 1 },
    });

    const row = wrapper.get("[data-test='prompt-list-row']");
    expect(row.classes()).toContain("selected");
    expect(row.text()).toContain(prompt.title);
    expect(row.text()).toContain("开发工具");
    expect(row.text()).toContain("复制 26 次");

    await row.trigger("click");
    await wrapper.get("[data-test='list-copy']").trigger("click");
    await wrapper.get("[data-test='list-favorite']").trigger("click");
    await wrapper.get("[data-test='list-pin']").trigger("click");

    expect(wrapper.emitted("select")).toEqual([[prompt]]);
    expect(wrapper.emitted("copy")).toEqual([[prompt]]);
    expect(wrapper.emitted("favorite")).toEqual([[prompt]]);
    expect(wrapper.emitted("pin")).toEqual([[prompt]]);
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
