import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Category, Prompt } from "@/types/prompt";

const GENERAL_CATEGORY_ID = "10000000-0000-4000-8000-000000000006";
const CUSTOM_CATEGORY_ID = "dff11ee5-155c-4942-a598-6ffa9b50bc9c";

const { categoryApi, confirmDialog, copyPromptText, promptApi, windowApi } =
  vi.hoisted(() => ({
    categoryApi: {
      list: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
    },
    confirmDialog: vi.fn(),
    copyPromptText: vi.fn(),
    promptApi: {
      list: vi.fn(),
      listTags: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setFavorite: vi.fn(),
      setPinned: vi.fn(),
      listSticky: vi.fn(),
      stats: vi.fn(),
    },
    windowApi: {
      enterMainMode: vi.fn(),
      enterStickyMode: vi.fn(),
      hideSticky: vi.fn(),
      showQuick: vi.fn(),
      getStickySettings: vi.fn(),
      setStickySettings: vi.fn(),
    },
  }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: confirmDialog,
}));

vi.mock("@/services/clipboard", () => ({
  copyPromptText,
}));

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
import StickyWindow from "@/windows/StickyWindow.vue";
import WorkbenchFilters from "@/components/WorkbenchFilters.vue";
import PdSelect from "@/components/ui/PdSelect.vue";

const categories: Category[] = [
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "投资研究",
    icon: "chart",
    color: "#478CA2",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 1,
  },
  {
    id: GENERAL_CATEGORY_ID,
    name: "通用效率",
    icon: "sparkles",
    color: "#6687AE",
    sortOrder: 5,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 3,
  },
  {
    id: CUSTOM_CATEGORY_ID,
    name: "测试分类",
    icon: "folder",
    color: "#64748B",
    sortOrder: 6,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 0,
  },
];

const invalidTemplatePrompt: Prompt = {
  id: "d6c3638d-4b01-4624-b13c-12917426b6a7",
  title: "A股量价行为深度分析",
  description: "",
  body: "分析基准日：{{分析日期，默认最新可获取交易日}}",
  categoryId: "10000000-0000-4000-8000-000000000002",
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

describe("category and raw-copy regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    promptApi.listSticky.mockResolvedValue([]);
    promptApi.listTags.mockResolvedValue([]);
    promptApi.stats.mockResolvedValue({
      total: 4,
      todayCopies: 0,
      favorites: 3,
      pinned: 3,
      templates: 0,
    });
    categoryApi.list.mockResolvedValue(categories);
    categoryApi.delete.mockResolvedValue({ deleted: true });
    confirmDialog.mockResolvedValue(true);
    copyPromptText.mockResolvedValue({
      status: "copied",
      stats: { copyCount: 1, lastCopiedAt: 2 },
    });
    windowApi.enterMainMode.mockResolvedValue({ mode: "main" });
    windowApi.enterStickyMode.mockResolvedValue({ mode: "sticky" });
    windowApi.hideSticky.mockResolvedValue({ hidden: true });
    windowApi.showQuick.mockResolvedValue({ shown: true });
    windowApi.getStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      density: "comfortable",
      x: null,
      y: null,
      monitorName: null,
      scaleFactor: null,
    });
    windowApi.setStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      density: "comfortable",
      x: null,
      y: null,
      monitorName: null,
      scaleFactor: null,
    });
  });

  it("combines favorite and category filters in the V3 workbench", async () => {
    const wrapper = mount(MainWindow, { global: { plugins: [createPinia()] } });
    await flushPromises();

    await wrapper.get("[data-test='rail-favorites']").trigger("click");
    await flushPromises();
    const filters = wrapper.getComponent(WorkbenchFilters);
    const [categorySelect] = filters.findAllComponents(PdSelect);
    categorySelect.vm.$emit(
      "update:modelValue",
      "10000000-0000-4000-8000-000000000002",
    );
    await flushPromises();

    expect(promptApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categoryId: "10000000-0000-4000-8000-000000000002",
        favoriteOnly: true,
        search: undefined,
        tab: "all",
        view: "all",
      }),
    );
    wrapper.unmount();
  });

  it("deletes a category only after choosing a transfer target", async () => {
    const wrapper = mount(MainWindow, { global: { plugins: [createPinia()] } });
    await flushPromises();

    await wrapper.get("[data-test='rail-categories']").trigger("click");
    await wrapper
      .get(`[data-test="delete-category-${CUSTOM_CATEGORY_ID}"]`)
      .trigger("click");
    await wrapper
      .get("[data-test='category-transfer-target']")
      .setValue(GENERAL_CATEGORY_ID);
    await wrapper.get("[data-test='confirm-category-delete']").trigger("click");
    await flushPromises();

    expect(categoryApi.delete).toHaveBeenCalledWith(
      CUSTOM_CATEGORY_ID,
      GENERAL_CATEGORY_ID,
    );
    wrapper.unmount();
  });

  it("keeps an invalid template visible and copies its original body", async () => {
    promptApi.list.mockResolvedValue({
      items: [invalidTemplatePrompt],
      total: 1,
    });
    const wrapper = mount(MainWindow, { global: { plugins: [createPinia()] } });
    await flushPromises();

    expect(wrapper.get("[data-test='prompt-list-row']").text()).toContain(
      invalidTemplatePrompt.title,
    );
    await wrapper.get("[data-test='list-copy']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: invalidTemplatePrompt.id,
      text: invalidTemplatePrompt.body,
    });

    const detailCopy = wrapper.get(".prompt-detail-pane .primary-button");
    expect(detailCopy.attributes("disabled")).toBeUndefined();
    expect(detailCopy.text()).toContain("复制");
    wrapper.unmount();
  });

  it("copies an invalid template from sticky mode as original text", async () => {
    promptApi.listSticky.mockResolvedValue([invalidTemplatePrompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: invalidTemplatePrompt.id,
      text: invalidTemplatePrompt.body,
    });
    expect(wrapper.get("[data-test='sticky-slot']").text()).toContain("已复制");
    wrapper.unmount();
  });
});
