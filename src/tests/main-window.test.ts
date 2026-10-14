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
      rename: vi.fn(),
      delete: vi.fn(),
    },
    promptApi: {
      list: vi.fn(),
      listTags: vi.fn(),
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

const STICKY_ENTRY_SELECTOR = "[data-test='rail-sticky-mode']";

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

describe("MainWindow V3 workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    promptApi.stats.mockResolvedValue({
      total: 0,
      todayCopies: 0,
      favorites: 0,
      pinned: 1,
      templates: 0,
    });
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    promptApi.listTags.mockResolvedValue([]);
    categoryApi.list.mockResolvedValue([
      {
        id: "category-1",
        name: "通用效率",
        icon: "sparkles",
        color: "#6687AE",
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
        promptCount: 1,
      },
      {
        id: "category-2",
        name: "写作创作",
        icon: "pen",
        color: "#7B75B5",
        sortOrder: 2,
        createdAt: 1,
        updatedAt: 1,
        promptCount: 0,
      },
    ]);
    windowApi.enterStickyMode.mockResolvedValue({ mode: "sticky" });
  });

  it("renders the V3 rail, four real stats, filters, and split workbench", async () => {
    const wrapper = await mountMainWindow();

    expect(wrapper.find(".workbench-rail").exists()).toBe(true);
    expect(wrapper.findAll(".dashboard-stat-grid article")).toHaveLength(4);
    expect(wrapper.find("[data-test='filter-category']").exists()).toBe(true);
    expect(wrapper.find(".prompt-list-pane").exists()).toBe(true);
    expect(wrapper.find(".prompt-detail-pane").exists()).toBe(true);
    expect(wrapper.get("[data-test='stat-today']").text()).toContain(
      "今日复制次数",
    );

    await wrapper.get(STICKY_ENTRY_SELECTOR).trigger("click");
    await flushPromises();

    expect(windowApi.enterStickyMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("suppresses repeated sticky transitions while the native call is pending", async () => {
    let resolveTransition!: (value: { mode: "sticky" }) => void;
    windowApi.enterStickyMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = await mountMainWindow();
    const entry = wrapper.get(STICKY_ENTRY_SELECTOR);

    const firstClick = entry.trigger("click");
    const secondClick = entry.trigger("click");
    await Promise.all([firstClick, secondClick]);

    expect(windowApi.enterStickyMode).toHaveBeenCalledOnce();
    expect(
      wrapper.get(STICKY_ENTRY_SELECTOR).attributes("disabled"),
    ).toBeDefined();

    resolveTransition({ mode: "sticky" });
    await flushPromises();
    expect(
      wrapper.get(STICKY_ENTRY_SELECTOR).attributes("disabled"),
    ).toBeUndefined();
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

    await wrapper.get(STICKY_ENTRY_SELECTOR).trigger("click");
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

  it("opens category management from rail, list, and category filter", async () => {
    const wrapper = await mountMainWindow();

    for (const selector of [
      "[data-test='rail-categories']",
      "[data-test='list-manage-categories']",
    ]) {
      await wrapper.get(selector).trigger("click");
      expect(wrapper.find(".category-manager-dialog").exists()).toBe(true);
      await wrapper.get("[aria-label='关闭分类管理']").trigger("click");
    }

    await wrapper.get("[data-test='filter-category']").setValue("__manage__");
    expect(wrapper.find(".category-manager-dialog").exists()).toBe(true);
    wrapper.unmount();
  });
});
