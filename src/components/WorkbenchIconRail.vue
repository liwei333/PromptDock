<script setup lang="ts">
import {
  FolderTree,
  LayoutDashboard,
  PanelsTopLeft,
  Settings,
  Star,
} from "lucide-vue-next";

import PdIconButton from "@/components/ui/PdIconButton.vue";

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
    <strong class="rail-brand">PromptDock</strong>
    <nav>
      <PdIconButton
        data-test="rail-home"
        class="active"
        label="工作台"
        tooltip="工作台"
        :icon="LayoutDashboard"
        aria-current="page"
        @click="$emit('home')"
      />
      <PdIconButton
        data-test="rail-favorites"
        :class="{ active: favoriteActive }"
        label="收藏"
        tooltip="仅看收藏"
        :icon="Star"
        :pressed="Boolean(favoriteActive)"
        @click="$emit('favorites')"
      />
      <PdIconButton
        data-test="rail-categories"
        label="分类管理"
        :icon="FolderTree"
        @click="$emit('categories')"
      />
      <PdIconButton
        data-test="rail-sticky-mode"
        label="快捷便签"
        :icon="PanelsTopLeft"
        :disabled="switchingSticky"
        @click="$emit('sticky')"
      />
    </nav>
    <PdIconButton
      class="rail-settings"
      data-test="rail-settings"
      label="设置与运行信息"
      tooltip="设置与运行信息"
      :icon="Settings"
      @click="$emit('settings')"
    />
  </aside>
</template>
