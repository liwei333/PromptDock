import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const { copyPromptText, listSticky } = vi.hoisted(() => ({
  copyPromptText: vi.fn().mockResolvedValue({
    status: "copied",
    stats: { copyCount: 1, lastCopiedAt: 2 },
  }),
  listSticky: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/api/commands", () => ({
  promptApi: { listSticky },
  windowApi: {
    hideSticky: vi.fn().mockResolvedValue({ hidden: true }),
    showQuick: vi.fn().mockResolvedValue({ shown: true }),
    getStickySettings: vi.fn().mockResolvedValue({ alwaysOnTop: true }),
    setStickySettings: vi.fn().mockResolvedValue({ alwaysOnTop: true }),
  },
}));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));

import StickyWindow from "@/windows/StickyWindow.vue";

describe("StickyWindow", () => {
  it("always renders five fixed slots when the library has no pins", async () => {
    const wrapper = mount(StickyWindow);
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(wrapper.text()).toContain("空位 1");
    expect(wrapper.text()).toContain("0/5");
  });

  it("copies an unrecognized variable placeholder as original text", async () => {
    const prompt = {
      id: "investment-prompt",
      title: "A股量价行为深度分析",
      description: "",
      body: "分析基准日：{{分析日期，默认最新可获取交易日}}",
      categoryId: "investment",
      categoryName: "投资研究",
      tags: [],
      isFavorite: false,
      isPinned: true,
      pinOrder: 1,
      copyCount: 0,
      lastCopiedAt: null,
      createdAt: 1,
      updatedAt: 1,
    };
    listSticky.mockResolvedValueOnce([prompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: prompt.id,
      text: prompt.body,
    });
    expect(wrapper.get("[data-test='sticky-slot']").text()).toContain("已复制");
  });
});
