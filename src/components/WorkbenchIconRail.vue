<script setup lang="ts">
defineProps<{ favoriteActive?: boolean; switchingSticky?: boolean }>();
defineEmits<{
  home: [];
  favorites: [];
  categories: [];
  sticky: [];
  settings: [];
}>();
</script>

<template>
  <aside class="workbench-rail" aria-label="主导航">
    <div class="mac-lights" aria-hidden="true"><i /><i /><i /></div>
    <strong class="rail-brand">PromptDock</strong>
    <nav>
      <button
        data-test="rail-home"
        class="active"
        aria-label="工作台"
        title="工作台"
        @click="$emit('home')"
      >
        <span aria-hidden="true">⌂</span>
      </button>
      <button
        data-test="rail-favorites"
        :class="{ active: favoriteActive }"
        aria-label="收藏"
        title="收藏"
        @click="$emit('favorites')"
      >
        <span aria-hidden="true">☆</span>
      </button>
      <button
        data-test="rail-categories"
        aria-label="分类管理"
        title="分类管理"
        @click="$emit('categories')"
      >
        <span aria-hidden="true">▢</span>
      </button>
      <button
        data-test="rail-sticky-mode"
        aria-label="快捷便签"
        title="快捷便签"
        :disabled="switchingSticky"
        @click="$emit('sticky')"
      >
        <span aria-hidden="true">▤</span>
      </button>
    </nav>
    <button
      class="rail-settings"
      data-test="rail-settings"
      aria-label="设置与运行信息"
      title="设置"
      @click="$emit('settings')"
    >
      <span aria-hidden="true">⚙</span>
    </button>
  </aside>
</template>
