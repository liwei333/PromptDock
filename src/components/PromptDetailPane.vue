<script setup lang="ts">
import {
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileText,
  Pencil,
  Pin,
  PinOff,
  Plus,
  TriangleAlert,
} from "lucide-vue-next";
import { computed } from "vue";

import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";
import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
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
      <span aria-hidden="true"><FileText /></span
      ><strong>选择一条提示词</strong>
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
            <PdBadge v-for="tag in prompt!.tags" :key="tag">
              {{ tag }}
            </PdBadge>
            <PdBadge class="category" tone="accent">
              {{ prompt!.categoryName }}
            </PdBadge>
            <small>最后编辑：{{ updatedLabel }}</small>
          </div>
        </div>
        <span
          class="detail-pin"
          :class="{ active: prompt!.isPinned }"
          :aria-label="prompt!.isPinned ? '已加入便签' : '未加入便签'"
          ><Pin v-if="prompt!.isPinned" aria-hidden="true" />
          <PinOff v-else aria-hidden="true"
        /></span>
      </header>
      <p class="v3-detail-description">
        {{ prompt!.description || "没有补充说明" }}
      </p>
      <PdStatusMessage
        v-if="template?.error"
        class="template-error"
        tone="danger"
        :icon="TriangleAlert"
        :message="`${template.error.message}。复制时将保留原始占位符。`"
      />
      <section class="v3-body-preview">
        <span><Code2 aria-hidden="true" />预览</span>
        <pre>{{ prompt!.body }}</pre>
      </section>
      <div class="v3-detail-actions">
        <PdButton
          variant="primary"
          data-test="detail-copy"
          @click="emit('copy', prompt!)"
        >
          <template #leading><Copy aria-hidden="true" /></template>
          {{ hasVariables ? "填写变量并复制" : "一键复制" }}
        </PdButton>
        <PdButton
          variant="ghost"
          data-test="detail-edit"
          @click="emit('edit', prompt!)"
        >
          <template #leading><Pencil aria-hidden="true" /></template>
          编辑
        </PdButton>
        <PdButton variant="ghost" data-test="detail-new" @click="emit('new')">
          <template #leading><Plus aria-hidden="true" /></template>
          新建
        </PdButton>
        <PdButton
          variant="ghost"
          data-test="detail-export"
          @click="emit('export')"
        >
          <template #leading><Download aria-hidden="true" /></template>
          导出
        </PdButton>
      </div>
      <section v-if="hasVariables" class="v3-template-summary">
        <strong><ChevronDown aria-hidden="true" />变量模板</strong
        ><span>填写变量后，可快速生成个性化提示词</span>
      </section>
    </template>
  </section>
</template>
