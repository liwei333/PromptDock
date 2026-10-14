import { mount } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const { copyPromptText } = vi.hoisted(() => ({
  copyPromptText: vi.fn().mockResolvedValue({
    status: "copied",
    stats: { copyCount: 1, lastCopiedAt: 2 },
  }),
}));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));

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

  it("filters Chinese text in the embedded main-window palette", async () => {
    const prompts = [
      item(1),
      { ...item(2), title: "季度经营复盘", body: "检查现金流" },
    ];
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });
    await wrapper.get("input").setValue("现金流");
    const results = wrapper.findAll("[data-test='quick-result']");
    expect(results).toHaveLength(1);
    expect(results[0].text()).toContain("季度经营复盘");
  });

  it("copies an unrecognized variable placeholder as original text", async () => {
    const prompt = {
      ...item(1),
      body: "分析基准日：{{分析日期，默认最新可获取交易日}}",
    };
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt], embedded: true },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: prompt.id,
      text: prompt.body,
    });
    expect(wrapper.emitted("copied")).toEqual([[prompt]]);
  });
});
