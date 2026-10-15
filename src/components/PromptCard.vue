<script setup lang="ts">
import {
  Braces,
  Copy,
  Pin,
  PinOff,
  Star,
  TriangleAlert,
} from "lucide-vue-next";
import { computed } from "vue";

import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt; copying?: boolean }>();
defineEmits<{
  select: [prompt: Prompt];
  copy: [prompt: Prompt];
  favorite: [prompt: Prompt];
  pin: [prompt: Prompt];
}>();

const template = computed(() => inspectTemplateVariables(props.prompt.body));
const hasVariables = computed(
  () => !template.value.error && template.value.variables.length > 0,
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
      <PdBadge class="category-pill" tone="accent">
        {{ prompt.categoryName }}
      </PdBadge>
      <span
        v-if="hasVariables || template.error"
        class="template-mark"
        :class="{ invalid: template.error }"
        data-test="template-state"
        role="img"
        :aria-label="template.error ? '变量模板格式无效' : '变量模板'"
        :title="template.error?.message"
      >
        <TriangleAlert v-if="template.error" aria-hidden="true" />
        <Braces v-else aria-hidden="true" />
      </span>
      <PdIconButton
        class="card-favorite"
        :label="prompt.isFavorite ? '取消收藏' : '收藏'"
        :icon="Star"
        :pressed="prompt.isFavorite"
        @click.stop="$emit('favorite', prompt)"
        @keydown.stop
      />
    </header>
    <h3 :title="prompt.title">{{ prompt.title }}</h3>
    <p class="description">{{ prompt.description || prompt.body }}</p>
    <div class="tags">
      <span v-for="tag in prompt.tags.slice(0, 3)" :key="tag">#{{ tag }}</span>
    </div>
    <footer>
      <span class="usage">复制 {{ prompt.copyCount }} 次</span>
      <PdButton
        class="pin-button"
        variant="ghost"
        size="sm"
        :aria-label="prompt.isPinned ? '从便签移除' : '加入便签'"
        @click.stop="$emit('pin', prompt)"
        @keydown.stop
      >
        <template #leading>
          <PinOff v-if="prompt.isPinned" aria-hidden="true" />
          <Pin v-else aria-hidden="true" />
        </template>
        {{ prompt.isPinned ? "已置顶" : "置顶" }}
      </PdButton>
      <PdButton
        variant="primary"
        size="sm"
        data-test="copy"
        :loading="copying"
        @click.stop="$emit('copy', prompt)"
        @keydown.stop
      >
        <template #leading><Copy aria-hidden="true" /></template>
        {{ copying ? "处理中…" : hasVariables ? "填写并复制" : "复制" }}
      </PdButton>
    </footer>
  </article>
</template>
