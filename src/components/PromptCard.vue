<script setup lang="ts">
import { computed } from "vue";

import { extractTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt; copying?: boolean }>();
defineEmits<{
  select: [prompt: Prompt];
  copy: [prompt: Prompt];
  favorite: [prompt: Prompt];
  pin: [prompt: Prompt];
}>();

const hasVariables = computed(
  () => extractTemplateVariables(props.prompt.body).length > 0,
);
</script>

<template>
  <article
    class="prompt-card"
    tabindex="0"
    @click="$emit('select', prompt)"
    @keydown.enter="$emit('select', prompt)"
  >
    <header class="card-header">
      <span class="category-pill">{{ prompt.categoryName }}</span>
      <span v-if="hasVariables" class="template-mark">{{ "{}" }}</span>
      <button
        class="icon-button"
        :aria-label="prompt.isFavorite ? '取消收藏' : '收藏'"
        @click.stop="$emit('favorite', prompt)"
      >
        {{ prompt.isFavorite ? "★" : "☆" }}
      </button>
    </header>
    <h3 :title="prompt.title">{{ prompt.title }}</h3>
    <p class="description">{{ prompt.description || prompt.body }}</p>
    <div class="tags">
      <span v-for="tag in prompt.tags.slice(0, 3)" :key="tag">#{{ tag }}</span>
    </div>
    <footer>
      <span class="usage">复制 {{ prompt.copyCount }} 次</span>
      <button
        class="ghost-button pin-button"
        :aria-label="prompt.isPinned ? '从便签移除' : '加入便签'"
        @click.stop="$emit('pin', prompt)"
      >
        {{ prompt.isPinned ? "已置顶" : "置顶" }}
      </button>
      <button
        class="copy-button"
        data-test="copy"
        :disabled="copying"
        @click.stop="$emit('copy', prompt)"
      >
        {{ copying ? "处理中…" : hasVariables ? "填写并复制" : "复制" }}
      </button>
    </footer>
  </article>
</template>
