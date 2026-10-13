import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import QuickPalette from "@/components/QuickPalette.vue";
import type { Prompt } from "@/types/prompt";

function item(index: number): Prompt {
  return {
    id: `p${index}`,
    title: `提示词 ${index}`,
    description: "",
    body: `正文 ${index}`,
    categoryId: "c1",
    categoryName: "通用效率",
    tags: [],
    isFavorite: false,
    isPinned: false,
    pinOrder: null,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("QuickPalette", () => {
  it("shows no more than 12 candidates and wraps arrow navigation", async () => {
    const prompts = Array.from({ length: 14 }, (_, index) => item(index));
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });

    expect(wrapper.findAll("[data-test='quick-result']")).toHaveLength(12);
    const input = wrapper.get("input");
    await input.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 11");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 0");
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
