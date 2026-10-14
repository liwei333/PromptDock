<script setup lang="ts">
import { computed } from "vue";

import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{
  prompts: Prompt[];
  selectedId: string | null;
  total: number;
  loading?: boolean;
  error?: string | null;
  copyingId?: string | null;
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
</script>

<template>
  <section class="prompt-list-pane" aria-labelledby="prompt-list-title">
    <header>
      <div>
        <h2 id="prompt-list-title">{{ countLabel }}</h2>
        <span>最近使用⌄</span>
      </div>
      <div>
        <button
          type="button"
          class="text-action"
          data-test="list-manage-categories"
          @click="$emit('manage-categories')"
        >
          ⚙ 管理分类
        </button>
        <button
          type="button"
          class="primary-button"
          data-test="list-new-prompt"
          @click="$emit('new')"
        >
          ＋ 新建提示词
        </button>
      </div>
    </header>

    <div v-if="loading" class="v3-pane-state">
      <span class="spinner" />正在读取本机数据库…
    </div>
    <div v-else-if="error" class="v3-pane-state error-state">
      <strong>无法读取提示词</strong>
      <p>{{ error }}</p>
      <button class="primary-button" @click="$emit('retry')">重试</button>
    </div>
    <div v-else-if="!prompts.length" class="v3-pane-state">
      <strong>没有符合条件的提示词</strong>
      <p>调整筛选条件，或创建一条新的提示词。</p>
      <button class="primary-button" @click="$emit('new')">新建提示词</button>
    </div>
    <div v-else class="v3-prompt-list">
      <article
        v-for="prompt in prompts"
        :key="prompt.id"
        data-test="prompt-list-row"
        class="v3-prompt-row"
        :class="{ selected: selectedId === prompt.id }"
        tabindex="0"
        @click="$emit('select', prompt)"
        @keydown.enter="$emit('select', prompt)"
      >
        <span class="prompt-kind" aria-hidden="true">{{
          hasTemplate(prompt) ? "{}" : "⌁"
        }}</span>
        <div class="prompt-row-copy">
          <div class="prompt-row-title">
            <strong>{{ prompt.title }}</strong>
            <button
              type="button"
              data-test="list-favorite"
              :aria-label="prompt.isFavorite ? '取消收藏' : '收藏'"
              @click.stop="$emit('favorite', prompt)"
            >
              {{ prompt.isFavorite ? "★" : "☆" }}
            </button>
            <button
              type="button"
              data-test="list-pin"
              :aria-label="prompt.isPinned ? '从便签移除' : '加入便签'"
              @click.stop="$emit('pin', prompt)"
            >
              {{ prompt.isPinned ? "⌖" : "⌁" }}
            </button>
          </div>
          <p>{{ prompt.description || prompt.body }}</p>
          <div class="prompt-row-tags">
            <span v-for="tag in prompt.tags.slice(0, 3)" :key="tag">{{
              tag
            }}</span>
            <span class="category">{{ prompt.categoryName }}</span>
          </div>
          <small>复制 {{ prompt.copyCount }} 次</small>
        </div>
        <button
          type="button"
          class="list-copy-button"
          data-test="list-copy"
          :disabled="copyingId === prompt.id"
          @click.stop="$emit('copy', prompt)"
        >
          {{
            copyingId === prompt.id
              ? "处理中…"
              : hasTemplate(prompt)
                ? "填写变量"
                : "复制"
          }}
        </button>
      </article>
    </div>
  </section>
</template>
