<script setup lang="ts">
import type { Category, PromptQuery, PromptSort } from "@/types/prompt";

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

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function changeCategory(event: Event): void {
  const value = selectValue(event);
  if (value === "__manage__") {
    emit("manageCategories");
    return;
  }
  emit("change", { categoryId: optional(value) });
}
</script>

<template>
  <section class="workbench-filters" aria-label="搜索与筛选">
    <label class="v3-search">
      <span aria-hidden="true">⌕</span>
      <input
        id="main-search"
        :value="query.search ?? ''"
        placeholder="搜索提示词 / 标签 / 内容"
        @input="$emit('search', ($event.target as HTMLInputElement).value)"
      />
      <kbd>⌘K</kbd>
    </label>
    <select
      data-test="filter-category"
      aria-label="分类筛选"
      :value="query.categoryId ?? ''"
      @change="changeCategory"
    >
      <option value="">全部分类</option>
      <option
        v-for="category in categories"
        :key="category.id"
        :value="category.id"
      >
        {{ category.name }}
      </option>
      <option value="__manage__">⚙ 管理分类…</option>
    </select>
    <select
      data-test="filter-tag"
      aria-label="标签筛选"
      :value="query.tag ?? ''"
      @change="$emit('change', { tag: optional(selectValue($event)) })"
    >
      <option value="">全部标签</option>
      <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
    </select>
    <select
      data-test="filter-favorite"
      aria-label="收藏筛选"
      :value="query.favoriteOnly ? 'yes' : ''"
      @change="$emit('change', { favoriteOnly: selectValue($event) === 'yes' })"
    >
      <option value="">收藏状态</option>
      <option value="yes">仅已收藏</option>
    </select>
    <select
      data-test="filter-pinned"
      aria-label="置顶筛选"
      :value="query.pinnedOnly ? 'yes' : ''"
      @change="$emit('change', { pinnedOnly: selectValue($event) === 'yes' })"
    >
      <option value="">置顶状态</option>
      <option value="yes">仅已置顶</option>
    </select>
    <select
      data-test="filter-recent"
      aria-label="最近使用筛选"
      :value="query.recentOnly ? 'yes' : ''"
      @change="$emit('change', { recentOnly: selectValue($event) === 'yes' })"
    >
      <option value="">最近使用</option>
      <option value="yes">仅使用过</option>
    </select>
    <select
      data-test="filter-template"
      aria-label="变量筛选"
      :value="query.templateOnly ? 'yes' : ''"
      @change="$emit('change', { templateOnly: selectValue($event) === 'yes' })"
    >
      <option value="">变量模板</option>
      <option value="yes">仅含变量</option>
    </select>
    <select
      class="filter-sort"
      aria-label="排序"
      :value="query.sort ?? 'recent'"
      @change="$emit('change', { sort: selectValue($event) as PromptSort })"
    >
      <option value="recent">最近更新</option>
      <option value="popular">最常使用</option>
      <option value="name">标题排序</option>
    </select>
    <button
      type="button"
      class="filter-clear"
      data-test="clear-filters"
      @click="$emit('clear')"
    >
      清空
    </button>
  </section>
</template>
