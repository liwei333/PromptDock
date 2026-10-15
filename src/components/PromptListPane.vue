<script setup lang="ts">
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  FileText,
  Pin,
  PinOff,
  Plus,
  Settings,
  Star,
} from "lucide-vue-next";
import { computed } from "vue";

import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{
  prompts: Prompt[];
  selectedId: string | null;
  total: number;
  loading?: boolean;
  error?: string | null;
  copyingId?: string | null;
  copiedId?: string | null;
}>();
defineEmits<{
  select: [prompt: Prompt];
  copy: [prompt: Prompt];
  favorite: [prompt: Prompt];
  pin: [prompt: Prompt];
  "manage-categories": [];
  new: [];
  retry: [];
}>();

const countLabel = computed(() => `提示词列表 (${props.total})`);
const hasTemplate = (prompt: Prompt) => {
  const result = inspectTemplateVariables(prompt.body);
  return !result.error && result.variables.length > 0;
};
const copyLabel = (prompt: Prompt) => {
  if (props.copiedId === prompt.id) return "已复制";
  if (props.copyingId === prompt.id) return "正在复制提示词";
  return "复制提示词";
};
</script>

<template>
  <section class="prompt-list-pane" aria-labelledby="prompt-list-title">
    <header>
      <div>
        <h2 id="prompt-list-title">{{ countLabel }}</h2>
        <span class="prompt-list-sort"
          >最近使用<ChevronDown aria-hidden="true"
        /></span>
      </div>
      <div>
        <PdButton
          variant="ghost"
          size="sm"
          data-test="list-manage-categories"
          @click="$emit('manage-categories')"
        >
          <template #leading><Settings aria-hidden="true" /></template>
          管理分类
        </PdButton>
        <PdButton
          variant="primary"
          size="sm"
          data-test="list-new-prompt"
          @click="$emit('new')"
        >
          <template #leading><Plus aria-hidden="true" /></template>
          新建提示词
        </PdButton>
      </div>
    </header>

    <div v-if="loading" class="v3-pane-state">
      <span class="spinner" />正在读取本机数据库…
    </div>
    <div v-else-if="error" class="v3-pane-state error-state">
      <strong>无法读取提示词</strong>
      <p>{{ error }}</p>
      <PdButton variant="primary" @click="$emit('retry')">重试</PdButton>
    </div>
    <div v-else-if="!prompts.length" class="v3-pane-state">
      <strong>没有符合条件的提示词</strong>
      <p>调整筛选条件，或创建一条新的提示词。</p>
      <PdButton variant="primary" @click="$emit('new')">新建提示词</PdButton>
    </div>
    <div
      v-else
      class="v3-prompt-list"
      role="listbox"
      aria-labelledby="prompt-list-title"
    >
      <article
        v-for="prompt in prompts"
        :key="prompt.id"
        data-test="prompt-list-row"
        class="v3-prompt-row"
        :class="{ selected: selectedId === prompt.id }"
        role="option"
        :aria-selected="selectedId === prompt.id"
        tabindex="0"
        @click="$emit('select', prompt)"
        @keydown.enter.self.prevent="$emit('select', prompt)"
      >
        <span class="prompt-kind" aria-hidden="true">
          <Code2 v-if="hasTemplate(prompt)" />
          <FileText v-else />
        </span>
        <div class="prompt-row-copy">
          <div class="prompt-row-title">
            <strong>{{ prompt.title }}</strong>
          </div>
          <p>{{ prompt.description || prompt.body }}</p>
          <div class="prompt-row-tags">
            <PdBadge v-for="tag in prompt.tags.slice(0, 3)" :key="tag">
              {{ tag }}
            </PdBadge>
            <PdBadge class="category" tone="accent">
              {{ prompt.categoryName }}
            </PdBadge>
          </div>
          <small>复制 {{ prompt.copyCount }} 次</small>
        </div>
        <div class="prompt-row-actions" @click.stop>
          <PdIconButton
            class="prompt-row-action favorite-action"
            data-test="list-favorite"
            :label="prompt.isFavorite ? '取消收藏' : '收藏'"
            :icon="Star"
            :pressed="prompt.isFavorite"
            @click="$emit('favorite', prompt)"
          />
          <PdIconButton
            class="prompt-row-action"
            data-test="list-pin"
            :label="prompt.isPinned ? '从便签移除' : '加入便签'"
            :icon="prompt.isPinned ? PinOff : Pin"
            :pressed="prompt.isPinned"
            @click="$emit('pin', prompt)"
          />
          <PdIconButton
            class="prompt-row-action copy-action"
            data-test="list-copy"
            :label="copyLabel(prompt)"
            :icon="copiedId === prompt.id ? Check : Copy"
            :disabled="copyingId === prompt.id"
            :aria-busy="copyingId === prompt.id || undefined"
            @click="$emit('copy', prompt)"
          />
        </div>
      </article>
    </div>
  </section>
</template>
