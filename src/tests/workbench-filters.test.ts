import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/ui/platform", () => ({
  detectDesktopUiPlatform: () => "macos",
  shortcutLabels: () => ({
    localSearch: "⌘K",
    globalQuick: "Option+Space",
  }),
}));

import WorkbenchFilters from "@/components/WorkbenchFilters.vue";
import PdSelect from "@/components/ui/PdSelect.vue";
import { usePromptStore } from "@/stores/promptStore";
import type { Category, PromptQuery } from "@/types/prompt";

const categories: Category[] = [
  {
    id: "category-1",
    name: "通用效率",
    icon: "sparkles",
    color: "#6687AE",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 2,
  },
];
const mountedFilters: VueWrapper[] = [];

function mountFilters(
  query: PromptQuery = {
    view: "all",
    tab: "all",
    sort: "recent",
  },
) {
  const wrapper = mount(WorkbenchFilters, {
    attachTo: document.body,
    props: { query, categories, tags: ["Alpha", "共享"] },
    global: { stubs: { Teleport: false } },
  });
  mountedFilters.push(wrapper);
  return wrapper;
}

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

describe("V3 workbench filter presentation", () => {
  afterEach(() => {
    for (const wrapper of mountedFilters.splice(0)) wrapper.unmount();
    document.body.replaceChildren();
  });

  it("uses named combobox triggers, real pressed buttons, and a Lucide search affordance", () => {
    const wrapper = mountFilters({
      view: "all",
      tab: "all",
      sort: "recent",
      favoriteOnly: true,
      pinnedOnly: false,
      recentOnly: true,
      templateOnly: false,
    });

    expect(wrapper.find("select").exists()).toBe(false);
    for (const label of ["分类筛选", "标签筛选", "排序"]) {
      expect(
        wrapper.find(`button[role="combobox"][aria-label="${label}"]`).exists(),
      ).toBe(true);
    }

    expect(
      wrapper
        .get('button[data-test="filter-favorite"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper
        .get('button[data-test="filter-pinned"]')
        .attributes("aria-pressed"),
    ).toBe("false");
    expect(
      wrapper
        .get('button[data-test="filter-recent"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper
        .get('button[data-test="filter-template"]')
        .attributes("aria-pressed"),
    ).toBe("false");

    const search = wrapper.get(".v3-search");
    expect(search.find("svg").exists()).toBe(true);
    expect(search.get("kbd").text()).toBe("⌘K");
  });

  it("emits boolean filter patches from the accessible toggle controls", async () => {
    const wrapper = mountFilters();

    await wrapper.get('button[data-test="filter-favorite"]').trigger("click");
    await wrapper.get('button[data-test="filter-pinned"]').trigger("click");
    await wrapper.get('button[data-test="filter-recent"]').trigger("click");
    await wrapper.get('button[data-test="filter-template"]').trigger("click");

    expect(wrapper.emitted("change")).toEqual([
      [{ favoriteOnly: true }],
      [{ pinnedOnly: true }],
      [{ recentOnly: true }],
      [{ templateOnly: true }],
    ]);
  });

  it("only shows clear for visible nondefault filter state and preserves its emit", async () => {
    const wrapper = mountFilters();
    expect(wrapper.find('[data-test="clear-filters"]').exists()).toBe(false);

    const nondefaultQueries: PromptQuery[] = [
      { search: "代码" },
      { categoryId: "category-1" },
      { tag: "Alpha" },
      { favoriteOnly: true },
      { pinnedOnly: true },
      { recentOnly: true },
      { templateOnly: true },
      { sort: "popular" },
    ];
    for (const query of nondefaultQueries) {
      await wrapper.setProps({
        query: { view: "all", tab: "all", sort: "recent", ...query },
      });
      expect(wrapper.find('[data-test="clear-filters"]').exists()).toBe(true);
    }

    await wrapper.get('[data-test="clear-filters"]').trigger("click");
    expect(wrapper.emitted("clear")).toHaveLength(1);
  });

  it("opens category management without leaking its sentinel into query patches", async () => {
    const wrapper = mountFilters();
    const [categorySelect] = wrapper.findAllComponents(PdSelect);

    categorySelect.vm.$emit("update:modelValue", "__manage__");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("manageCategories")).toHaveLength(1);
    expect(wrapper.emitted("change")).toBeUndefined();

    categorySelect.vm.$emit("update:modelValue", "category-1");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("change")).toEqual([[{ categoryId: "category-1" }]]);
    expect(
      JSON.stringify(wrapper.emitted("change") ?? []).includes("__manage__"),
    ).toBe(false);
  });
});
