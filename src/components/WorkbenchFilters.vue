<script setup lang="ts">
import { Braces, History, Pin, Search, Star } from "lucide-vue-next";
import { computed } from "vue";

import PdSelect, { type PdSelectOption } from "@/components/ui/PdSelect.vue";
import PdToggle from "@/components/ui/PdToggle.vue";
import type { Category, PromptQuery, PromptSort } from "@/types/prompt";
import { detectDesktopUiPlatform, shortcutLabels } from "@/ui/platform";

const props = defineProps<{
  query: PromptQuery;
  categories: Category[];
  tags: string[];
}>();
const emit = defineEmits<{
  change: [patch: PromptQuery];
  search: [value: string];
  clear: [];
  manageCategories: [];
}>();

function optional(value: string): string | undefined {
  return value || undefined;
}

function changeCategory(value: string): void {
  if (value === "__manage__") {
    emit("manageCategories");
    return;
  }
  emit("change", { categoryId: optional(value) });
}

const localSearchShortcut = shortcutLabels(
  detectDesktopUiPlatform(),
).localSearch;
const categoryOptions = computed<PdSelectOption[]>(() => [
  ...props.categories.map((category) => ({
    value: category.id,
    label: category.name,
  })),
  { value: "__manage__", label: "管理分类…" },
]);
const tagOptions = computed<PdSelectOption[]>(() =>
  props.tags.map((tag) => ({ value: tag, label: tag })),
);
const sortOptions: PdSelectOption[] = [
  { value: "recent", label: "最近更新" },
  { value: "popular", label: "最常使用" },
  { value: "name", label: "标题排序" },
];
const hasActiveFilters = computed(
  () =>
    Boolean(
      props.query.search ||
      props.query.categoryId ||
      props.query.tag ||
      props.query.favoriteOnly ||
      props.query.pinnedOnly ||
      props.query.recentOnly ||
      props.query.templateOnly,
    ) ||
    (props.query.view !== undefined && props.query.view !== "all") ||
    (props.query.tab !== undefined && props.query.tab !== "all") ||
    (props.query.sort !== undefined && props.query.sort !== "recent"),
);
</script>

<template>
  <section class="workbench-filters" aria-label="搜索与筛选">
    <label class="v3-search">
      <Search aria-hidden="true" />
      <input
        id="main-search"
        :value="query.search ?? ''"
        placeholder="搜索提示词 / 标签 / 内容"
        @input="$emit('search', ($event.target as HTMLInputElement).value)"
      />
      <kbd>{{ localSearchShortcut }}</kbd>
    </label>
    <PdSelect
      data-test="filter-category"
      label="分类筛选"
      placeholder="全部分类"
      :model-value="query.categoryId ?? ''"
      :options="categoryOptions"
      @update:model-value="changeCategory"
    />
    <PdSelect
      data-test="filter-tag"
      label="标签筛选"
      placeholder="全部标签"
      :model-value="query.tag ?? ''"
      :options="tagOptions"
      @update:model-value="$emit('change', { tag: optional($event) })"
    />
    <PdToggle
      data-test="filter-favorite"
      label="仅看收藏"
      :icon="Star"
      :pressed="Boolean(query.favoriteOnly)"
      @update:pressed="$emit('change', { favoriteOnly: $event })"
    />
    <PdToggle
      data-test="filter-pinned"
      label="仅看置顶"
      :icon="Pin"
      :pressed="Boolean(query.pinnedOnly)"
      @update:pressed="$emit('change', { pinnedOnly: $event })"
    />
    <PdToggle
      data-test="filter-recent"
      label="仅看最近使用"
      :icon="History"
      :pressed="Boolean(query.recentOnly)"
      @update:pressed="$emit('change', { recentOnly: $event })"
    />
    <PdToggle
      data-test="filter-template"
      label="仅看变量模板"
      :icon="Braces"
      :pressed="Boolean(query.templateOnly)"
      @update:pressed="$emit('change', { templateOnly: $event })"
    />
    <PdSelect
      class="filter-sort"
      data-test="filter-sort"
      label="排序"
      :model-value="query.sort ?? 'recent'"
      :options="sortOptions"
      @update:model-value="$emit('change', { sort: $event as PromptSort })"
    />
    <button
      v-if="hasActiveFilters"
      type="button"
      class="filter-clear"
      data-test="clear-filters"
      @click="$emit('clear')"
    >
      清空
    </button>
  </section>
</template>
