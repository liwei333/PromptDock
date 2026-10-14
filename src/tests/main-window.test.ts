import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Category } from "@/types/prompt";

const GENERAL_CATEGORY_ID = "10000000-0000-4000-8000-000000000006";
const CUSTOM_CATEGORY_ID = "dff11ee5-155c-4942-a598-6ffa9b50bc9c";

const { categoryDelete, categoryList, confirmDialog, promptList } = vi.hoisted(
  () => ({
    categoryDelete: vi.fn(),
    categoryList: vi.fn(),
    confirmDialog: vi.fn(),
    promptList: vi.fn(),
  }),
);

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: confirmDialog,
}));

vi.mock("@/api/commands", () => ({
  backupApi: {
    exportWithDialog: vi.fn(),
    previewWithDialog: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  },
  categoryApi: {
    list: categoryList,
    create: vi.fn(),
    rename: vi.fn(),
    delete: categoryDelete,
  },
  promptApi: {
    list: promptList,
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setFavorite: vi.fn(),
    setPinned: vi.fn(),
    listSticky: vi.fn().mockResolvedValue([]),
    stats: vi.fn().mockResolvedValue({
      total: 4,
      recent: 0,
      favorites: 3,
      pinned: 3,
      templates: 0,
    }),
  },
  windowApi: {
    showSticky: vi.fn(),
  },
}));

import MainWindow from "@/windows/MainWindow.vue";

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

describe("MainWindow category navigation", () => {
  beforeEach(() => {
    promptList.mockResolvedValue({ items: [], total: 0 });
    categoryList.mockResolvedValue(categories);
    categoryDelete.mockResolvedValue({ deleted: true });
    confirmDialog.mockResolvedValue(true);
  });

  it("clears quick filters when switching from favorites to a category", async () => {
    const wrapper = mount(MainWindow, { global: { plugins: [createPinia()] } });
    await flushPromises();

    await wrapper.get(".tabs button:nth-child(2)").trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-test="category-10000000-0000-4000-8000-000000000002"]')
      .trigger("click");
    await flushPromises();

    expect(promptList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categoryId: "10000000-0000-4000-8000-000000000002",
        search: undefined,
        tab: "all",
        view: "all",
      }),
    );
  });

  it("deletes a custom category after confirming prompts move to General", async () => {
    const wrapper = mount(MainWindow, { global: { plugins: [createPinia()] } });
    await flushPromises();

    await wrapper
      .get(`[data-test="delete-category-${CUSTOM_CATEGORY_ID}"]`)
      .trigger("click");
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith(
      expect.stringContaining("通用效率"),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(categoryDelete).toHaveBeenCalledWith(
      CUSTOM_CATEGORY_ID,
      GENERAL_CATEGORY_ID,
    );
  });
});
