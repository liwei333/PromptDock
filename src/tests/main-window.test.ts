import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { categoryApi, pinnedPrompt, promptApi, windowApi } = vi.hoisted(() => {
  const pinnedPrompt = {
    id: "pinned-1",
    title: "固定提示词",
    description: "",
    body: "固定正文",
    categoryId: "category-1",
    categoryName: "通用效率",
    tags: [],
    isFavorite: false,
    isPinned: true,
    pinOrder: 1,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };

  return {
    categoryApi: {
      list: vi.fn(),
      create: vi.fn(),
    },
    promptApi: {
      list: vi.fn(),
      stats: vi.fn(),
      listSticky: vi.fn(),
      setFavorite: vi.fn(),
      setPinned: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    windowApi: {
      enterStickyMode: vi.fn(),
    },
    pinnedPrompt,
  };
});

vi.mock("@/api/commands", () => ({
  backupApi: {
    exportWithDialog: vi.fn(),
    previewWithDialog: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  },
  categoryApi,
  promptApi,
  windowApi,
}));

import MainWindow from "@/windows/MainWindow.vue";

const STICKY_ENTRY_SELECTORS = [
  "[data-test='sidebar-sticky-mode']",
  "[data-test='toolbar-sticky-mode']",
  "[data-test='pinned-sticky-mode']",
];

async function mountMainWindow() {
  const wrapper = mount(MainWindow, {
    global: {
      plugins: [createPinia()],
      stubs: {
        CategoryCreateDialog: true,
        ImportPreviewDialog: true,
        PromptCard: true,
        PromptDetailDrawer: true,
        PromptEditorDialog: true,
        QuickPalette: true,
        RuntimeInfoDialog: true,
        StickyManagerDialog: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("MainWindow exclusive sticky-mode controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    promptApi.stats.mockResolvedValue({
      total: 0,
      recent: 0,
      favorites: 0,
      pinned: 1,
      templates: 0,
    });
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    categoryApi.list.mockResolvedValue([]);
    windowApi.enterStickyMode.mockResolvedValue({ mode: "sticky" });
  });

  it("routes all three full-window entry points through enterStickyMode", async () => {
    const wrapper = await mountMainWindow();

    for (const selector of STICKY_ENTRY_SELECTORS) {
      await wrapper.get(selector).trigger("click");
      await flushPromises();
    }

    expect(windowApi.enterStickyMode).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it("suppresses repeated transitions and disables every entry while pending", async () => {
    let resolveTransition!: (value: { mode: "sticky" }) => void;
    windowApi.enterStickyMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = await mountMainWindow();
    const toolbar = wrapper.get(STICKY_ENTRY_SELECTORS[1]);
    const sidebar = wrapper.get(STICKY_ENTRY_SELECTORS[0]);

    const firstClick = toolbar.trigger("click");
    const secondClick = sidebar.trigger("click");
    await Promise.all([firstClick, secondClick]);

    expect(windowApi.enterStickyMode).toHaveBeenCalledOnce();
    for (const selector of STICKY_ENTRY_SELECTORS) {
      expect(wrapper.get(selector).attributes("disabled")).toBeDefined();
    }

    resolveTransition({ mode: "sticky" });
    await flushPromises();
    for (const selector of STICKY_ENTRY_SELECTORS) {
      expect(wrapper.get(selector).attributes("disabled")).toBeUndefined();
    }
    wrapper.unmount();
  });

  it("renders accessible feedback when the native transition is rejected", async () => {
    windowApi.enterStickyMode.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = await mountMainWindow();
    const liveRegion = wrapper.get("[data-test='main-live-region']");
    const liveRegionElement = liveRegion.element;

    expect(liveRegion.text()).toBe("");

    await wrapper.get(STICKY_ENTRY_SELECTORS[1]).trigger("click");
    await flushPromises();

    const updatedLiveRegion = wrapper.get("[data-test='main-live-region']");
    expect(updatedLiveRegion.element).toBe(liveRegionElement);
    expect(updatedLiveRegion.text()).toContain("无法切换到便签模式");
    wrapper.unmount();
  });

  it("opens the quick palette with the Windows Ctrl+K shortcut", async () => {
    const wrapper = await mountMainWindow();

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".palette-overlay").exists()).toBe(true);
    wrapper.unmount();
  });
});
