import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { categoryApi, promptApi } = vi.hoisted(() => ({
  categoryApi: { list: vi.fn() },
  promptApi: {
    list: vi.fn(),
    listTags: vi.fn(),
    listSticky: vi.fn(),
    stats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setFavorite: vi.fn(),
    setPinned: vi.fn(),
  },
}));

vi.mock("@/api/commands", () => ({ categoryApi, promptApi }));

import { usePromptStore } from "@/stores/promptStore";

describe("V3 workbench filter store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    promptApi.listTags.mockResolvedValue(["Alpha", "共享"]);
    promptApi.listSticky.mockResolvedValue([]);
    promptApi.stats.mockResolvedValue({
      total: 8,
      todayCopies: 3,
      favorites: 2,
      pinned: 1,
      templates: 4,
    });
    categoryApi.list.mockResolvedValue([]);
  });

  it("loads complete SQLite-backed filter metadata and statistics", async () => {
    const store = usePromptStore();

    await store.load({
      search: "代码",
      categoryId: "category-1",
      tag: "Alpha",
      favoriteOnly: true,
      pinnedOnly: true,
      recentOnly: true,
      templateOnly: true,
    });

    expect(promptApi.list).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "代码",
        categoryId: "category-1",
        tag: "Alpha",
        favoriteOnly: true,
        pinnedOnly: true,
        recentOnly: true,
        templateOnly: true,
        limit: 200,
      }),
    );
    expect(promptApi.listTags).toHaveBeenCalledOnce();
    expect(store.tags).toEqual(["Alpha", "共享"]);
    expect(store.stats.todayCopies).toBe(3);
  });

  it("clears every workbench filter without changing the chosen sort", async () => {
    const store = usePromptStore();
    await store.load({
      search: "代码",
      categoryId: "category-1",
      tag: "Alpha",
      favoriteOnly: true,
      pinnedOnly: true,
      recentOnly: true,
      templateOnly: true,
      sort: "popular",
    });

    await store.resetFilters();

    expect(store.query).toEqual({
      view: "all",
      tab: "all",
      sort: "popular",
      search: undefined,
      categoryId: undefined,
      tag: undefined,
      favoriteOnly: false,
      pinnedOnly: false,
      recentOnly: false,
      templateOnly: false,
    });
    expect(promptApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: "popular",
        favoriteOnly: false,
        pinnedOnly: false,
        recentOnly: false,
        templateOnly: false,
      }),
    );
  });
});
