<script setup lang="ts">
import { computed } from "vue";

import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt | null; variableMode?: boolean }>();
const emit = defineEmits<{
  copy: [prompt: Prompt];
  edit: [prompt: Prompt];
  new: [];
  export: [];
  copied: [];
  cancelVariables: [];
}>();
const template = computed(() =>
  props.prompt ? inspectTemplateVariables(props.prompt.body) : null,
);
const hasVariables = computed(() =>
  Boolean(
    template.value && !template.value.error && template.value.variables.length,
  ),
);
const updatedLabel = computed(() =>
  props.prompt
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(props.prompt.updatedAt))
    : "",
);
</script>

<template>
  <section class="prompt-detail-pane" aria-label="提示词详情">
    <div v-if="!prompt" class="v3-detail-empty">
      <span aria-hidden="true">▤</span><strong>选择一条提示词</strong>
      <p>左侧列表中选择后，可在这里预览、复制或编辑完整正文。</p>
    </div>
    <TemplateVariablesPanel
      v-else-if="variableMode && hasVariables"
      :prompt="prompt"
      @cancel="emit('cancelVariables')"
      @copied="emit('copied')"
    />
    <template v-else>
      <header class="v3-detail-header">
        <div>
          <h2>{{ prompt!.title }}</h2>
          <div class="v3-detail-tags">
            <span v-for="tag in prompt!.tags" :key="tag">{{ tag }}</span>
            <span class="category">{{ prompt!.categoryName }}</span>
            <small>最后编辑：{{ updatedLabel }}</small>
          </div>
        </div>
        <span
          class="detail-pin"
          :class="{ active: prompt!.isPinned }"
          aria-label="置顶状态"
          >⌖</span
        >
      </header>
      <p class="v3-detail-description">
        {{ prompt!.description || "没有补充说明" }}
      </p>
      <p v-if="template?.error" class="template-error" role="alert">
        {{ template.error.message }}。复制时将保留原始占位符。
      </p>
      <section class="v3-body-preview">
        <span>〈/〉 预览</span>
        <pre>{{ prompt!.body }}</pre>
      </section>
      <div class="v3-detail-actions">
        <button class="primary-button" @click="emit('copy', prompt!)">
          ▣ {{ hasVariables ? "填写变量并复制" : "一键复制" }}
        </button>
        <button class="ghost-button" @click="emit('edit', prompt!)">
          ✎ 编辑
        </button>
        <button class="ghost-button" @click="emit('new')">＋ 新建</button>
        <button class="ghost-button" @click="emit('export')">⇩ 导出</button>
      </div>
      <section v-if="hasVariables" class="v3-template-summary">
        <strong>⌄ 变量模板</strong
        ><span>填写变量后，可快速生成个性化提示词</span>
      </section>
    </template>
  </section>
</template>
