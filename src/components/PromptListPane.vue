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
const emit = defineEmits<{
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
const selectFromKeyboard = (event: KeyboardEvent, prompt: Prompt) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("select", prompt);
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

    <div v-if="loading && !prompts.length" class="v3-pane-state">
      <span class="spinner" />正在读取本机数据库…
    </div>
    <div v-else-if="error && !prompts.length" class="v3-pane-state error-state">
      <strong>无法读取提示词</strong>
      <p>{{ error }}</p>
      <PdButton variant="primary" @click="$emit('retry')">重试</PdButton>
    </div>
    <div v-else-if="!prompts.length" class="v3-pane-state">
      <strong>没有符合条件的提示词</strong>
      <p>调整筛选条件，或创建一条新的提示词。</p>
      <PdButton variant="primary" @click="$emit('new')">新建提示词</PdButton>
    </div>
    <div v-else class="v3-prompt-list-region">
      <div
        v-if="error"
        class="v3-pane-inline-state"
        role="alert"
        data-test="list-refresh-error"
      >
        <span>刷新失败：{{ error }}</span>
        <PdButton
          variant="ghost"
          size="sm"
          data-test="list-refresh-retry"
          @click="$emit('retry')"
        >
          重试
        </PdButton>
      </div>
      <span v-if="loading" class="sr-only" role="status">正在刷新提示词…</span>
      <div
        class="v3-prompt-list"
        role="table"
        aria-labelledby="prompt-list-title"
        :aria-busy="loading || undefined"
      >
        <article
          v-for="prompt in prompts"
          :key="prompt.id"
          data-test="prompt-list-row"
          class="v3-prompt-row"
          :class="{ selected: selectedId === prompt.id }"
          role="row"
          :aria-selected="selectedId === prompt.id"
          @click="$emit('select', prompt)"
        >
          <div class="prompt-kind-cell" role="cell">
            <span class="prompt-kind" aria-hidden="true">
              <Code2 v-if="hasTemplate(prompt)" />
              <FileText v-else />
            </span>
          </div>
          <div class="prompt-row-main" role="cell">
            <button
              type="button"
              class="prompt-row-copy prompt-row-select"
              data-test="prompt-row-select"
              :aria-label="`选择提示词：${prompt.title}`"
              @click.stop="$emit('select', prompt)"
              @keydown="selectFromKeyboard($event, prompt)"
            >
              <span class="prompt-row-title">
                <strong>{{ prompt.title }}</strong>
              </span>
              <span class="prompt-row-description">
                {{ prompt.description || prompt.body }}
              </span>
              <span class="prompt-row-tags">
                <PdBadge v-for="tag in prompt.tags.slice(0, 3)" :key="tag">
                  {{ tag }}
                </PdBadge>
                <PdBadge class="category" tone="accent">
                  {{ prompt.categoryName }}
                </PdBadge>
              </span>
              <small>复制 {{ prompt.copyCount }} 次</small>
            </button>
          </div>
          <div class="prompt-row-actions" role="cell" @click.stop>
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
    </div>
  </section>
</template>
