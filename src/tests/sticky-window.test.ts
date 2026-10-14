import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import auxiliaryCapability from "../../src-tauri/capabilities/auxiliary.json";
import type { Prompt } from "@/types/prompt";

const pinnedPrompt: Prompt = {
  id: "pinned-1",
  title: "Codex 执行反馈模板",
  description: "用于让 Codex 按步骤执行任务并返回结构化执行结果。",
  body: "完整正文",
  categoryId: "category-1",
  categoryName: "开发工具",
  tags: ["Codex"],
  isFavorite: true,
  isPinned: true,
  pinOrder: 1,
  copyCount: 12,
  lastCopiedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const { promptApi, windowApi } = vi.hoisted(() => ({
  promptApi: { listSticky: vi.fn() },
  windowApi: {
    enterMainMode: vi.fn(),
    hideSticky: vi.fn(),
    showQuick: vi.fn(),
    getStickySettings: vi.fn(),
    setStickySettings: vi.fn(),
  },
}));

vi.mock("@/api/commands", () => ({
  promptApi,
  windowApi,
}));

import StickyWindow from "@/windows/StickyWindow.vue";

describe("StickyWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.listSticky.mockResolvedValue([]);
    windowApi.enterMainMode.mockResolvedValue({ mode: "main" });
    windowApi.hideSticky.mockResolvedValue({ hidden: true });
    windowApi.showQuick.mockResolvedValue({ shown: true });
    windowApi.getStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "comfortable",
    });
    windowApi.setStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "comfortable",
    });
  });

  it("grants the sticky window permission to start native dragging", () => {
    expect(auxiliaryCapability.windows).toContain("sticky");
    expect(auxiliaryCapability.permissions).toContain(
      "core:window:allow-start-dragging",
    );
  });

  it("marks the complete titlebar as a native deep drag region", () => {
    const wrapper = mount(StickyWindow);

    expect(
      wrapper.get(".sticky-titlebar").attributes("data-tauri-drag-region"),
    ).toBe("deep");
    wrapper.unmount();
  });

  it("always renders five fixed slots when the library has no pins", async () => {
    const wrapper = mount(StickyWindow);
    await flushPromises();
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(wrapper.text()).toContain("空位 1");
    expect(wrapper.text()).toContain("置顶 0 条");
    wrapper.unmount();
  });

  it("renders descriptions in comfortable density and keeps five slots", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(wrapper.get(".sticky-description").text()).toContain(
      pinnedPrompt.description,
    );
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    wrapper.unmount();
  });

  it("persists compact density and removes descriptions from compact rows", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockResolvedValueOnce({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "compact",
    });
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    await wrapper.get("[data-test='sticky-density-toggle']").trigger("click");
    await flushPromises();

    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      density: "compact",
    });
    expect(wrapper.get(".sticky-window").classes()).toContain("compact");
    expect(wrapper.find(".sticky-description").exists()).toBe(false);
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    wrapper.unmount();
  });

  it("keeps the displayed density and reports an accessible error when resize fails", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    await wrapper.get("[data-test='sticky-density-toggle']").trigger("click");
    await flushPromises();

    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(wrapper.get("[aria-live='polite']").text()).toContain(
      "无法调整便签尺寸",
    );
    wrapper.unmount();
  });

  it("switches to full mode from the title icon and footer", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-test='manage-in-main']").trigger("click");
    await flushPromises();

    expect(windowApi.enterMainMode).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("suppresses repeated full-mode transitions while one is pending", async () => {
    let resolveTransition!: (value: { mode: "main" }) => void;
    windowApi.enterMainMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = mount(StickyWindow);
    const titleControl = wrapper.get("[aria-label='切换到完整模式']");
    const footerControl = wrapper.get("[data-test='manage-in-main']");

    const titleClick = titleControl.trigger("click");
    const footerClick = footerControl.trigger("click");
    await Promise.all([titleClick, footerClick]);

    expect(windowApi.enterMainMode).toHaveBeenCalledOnce();
    expect(titleControl.attributes("disabled")).toBeDefined();
    expect(footerControl.attributes("disabled")).toBeDefined();

    resolveTransition({ mode: "main" });
    await flushPromises();
    expect(titleControl.attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("renders accessible feedback when switching to full mode fails", async () => {
    windowApi.enterMainMode.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[aria-live='polite']").text()).toContain(
      "无法切换到完整模式",
    );
    wrapper.unmount();
  });

  it("keeps close as the explicit zero-window action", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(windowApi.hideSticky).toHaveBeenCalledOnce();
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("handles a rejected close without opening full mode", async () => {
    windowApi.hideSticky.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[aria-live='polite']").text()).toContain(
      "无法收起便签",
    );
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
