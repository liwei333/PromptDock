import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { categoryApi, promptApi } from "@/api/commands";
import type {
  Category,
  DashboardStats,
  Prompt,
  PromptInput,
  PromptQuery,
} from "@/types/prompt";

function messageOf(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return String(error || "发生未知错误");
}

export const usePromptStore = defineStore("prompts", () => {
  const prompts = ref<Prompt[]>([]);
  const categories = ref<Category[]>([]);
  const tags = ref<string[]>([]);
  const stats = ref<DashboardStats>({
    total: 0,
    todayCopies: 0,
    favorites: 0,
    pinned: 0,
    templates: 0,
  });
  const query = ref<PromptQuery>({ view: "all", tab: "all", sort: "recent" });
  const total = ref(0);
  const sticky = ref<Prompt[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pinned = computed(() => sticky.value);

  async function load(nextQuery?: PromptQuery): Promise<void> {
    if (nextQuery) query.value = { ...query.value, ...nextQuery };
    loading.value = true;
    error.value = null;
    try {
      const [page, categoryRows, dashboard, stickyRows, tagRows] =
        await Promise.all([
          promptApi.list({ ...query.value, limit: 200 }),
          categoryApi.list(),
          promptApi.stats(),
          promptApi.listSticky(),
          promptApi.listTags(),
        ]);
      prompts.value = page.items;
      total.value = page.total;
      categories.value = categoryRows;
      stats.value = dashboard;
      sticky.value = stickyRows;
      tags.value = tagRows;
    } catch (reason) {
      error.value = messageOf(reason);
    } finally {
      loading.value = false;
    }
  }

  async function save(input: PromptInput, id?: string): Promise<Prompt> {
    const saved = id
      ? await promptApi.update(id, input)
      : await promptApi.create(input);
    await load();
    return saved;
  }

  async function remove(id: string): Promise<void> {
    await promptApi.delete(id);
    await load();
  }

  async function favorite(prompt: Prompt): Promise<void> {
    await promptApi.setFavorite(prompt.id, !prompt.isFavorite);
    await load();
  }

  async function pin(prompt: Prompt): Promise<void> {
    await promptApi.setPinned(prompt.id, !prompt.isPinned);
    await load();
  }

  async function resetFilters(): Promise<void> {
    query.value = {
      view: "all",
      tab: "all",
      sort: query.value.sort ?? "recent",
      search: undefined,
      categoryId: undefined,
      tag: undefined,
      favoriteOnly: false,
      pinnedOnly: false,
      recentOnly: false,
      templateOnly: false,
    };
    await load();
  }

  return {
    prompts,
    categories,
    tags,
    stats,
    query,
    total,
    sticky,
    loading,
    error,
    pinned,
    load,
    save,
    remove,
    favorite,
    pin,
    resetFilters,
  };
});
