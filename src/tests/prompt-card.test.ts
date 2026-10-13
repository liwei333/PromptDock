import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PromptCard from "@/components/PromptCard.vue";
import type { Prompt } from "@/types/prompt";

const prompt: Prompt = {
  id: "p1",
  title: "代码审查",
  description: "审查当前变更",
  body: "请审查全部代码",
  categoryId: "c1",
  categoryName: "技术研发",
  tags: ["质量"],
  isFavorite: false,
  isPinned: false,
  pinOrder: null,
  copyCount: 2,
  lastCopiedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("PromptCard", () => {
  it("separates card selection from the copy action", async () => {
    const wrapper = mount(PromptCard, { props: { prompt } });

    await wrapper.get("[data-test='copy']").trigger("click");
    expect(wrapper.emitted("copy")).toEqual([[prompt]]);
    expect(wrapper.emitted("select")).toBeUndefined();

    await wrapper.get("article").trigger("click");
    expect(wrapper.emitted("select")).toEqual([[prompt]]);
  });
});
