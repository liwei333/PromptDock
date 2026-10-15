<script setup lang="ts">
import { Copy, Pencil, TriangleAlert, X } from "lucide-vue-next";
import { computed } from "vue";

import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";
import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt; variableMode?: boolean }>();
const emit = defineEmits<{
  close: [];
  edit: [prompt: Prompt];
  copy: [prompt: Prompt];
  copied: [];
}>();
const template = computed(() => inspectTemplateVariables(props.prompt.body));
const hasVariables = computed(
  () => !template.value.error && template.value.variables.length > 0,
);
</script>

<template>
  <div class="drawer-backdrop" @mousedown.self="emit('close')">
    <aside class="detail-drawer">
      <TemplateVariablesPanel
        v-if="variableMode && hasVariables"
        :prompt="prompt"
        @cancel="emit('close')"
        @copied="emit('copied')"
      />
      <template v-else>
        <header>
          <div>
            <PdBadge class="category-pill" tone="accent">
              {{ prompt.categoryName }}
            </PdBadge>
            <h2>{{ prompt.title }}</h2>
          </div>
          <PdIconButton label="关闭详情" :icon="X" @click="emit('close')" />
        </header>
        <p class="drawer-description">
          {{ prompt.description || "没有补充说明" }}
        </p>
        <PdStatusMessage
          v-if="template.error"
          class="template-error"
          data-test="template-error"
          tone="danger"
          :icon="TriangleAlert"
          :message="`${template.error.message}。复制时将保留原始占位符。`"
        />
        <div class="tags">
          <PdBadge v-for="tag in prompt.tags" :key="tag">{{ tag }}</PdBadge>
        </div>
        <section class="body-panel">
          <span class="eyebrow">完整正文</span>
          <pre>{{ prompt.body }}</pre>
        </section>
        <div class="drawer-meta">
          已复制 {{ prompt.copyCount }} 次 ·
          {{ prompt.isFavorite ? "已收藏" : "未收藏" }}
        </div>
        <footer>
          <PdButton
            variant="ghost"
            data-test="drawer-edit"
            @click="emit('edit', prompt)"
          >
            <template #leading><Pencil aria-hidden="true" /></template>
            编辑
          </PdButton>
          <PdButton
            variant="primary"
            data-test="drawer-copy"
            @click="emit('copy', prompt)"
          >
            <template #leading><Copy aria-hidden="true" /></template>
            {{
              template.error
                ? "复制原始正文"
                : hasVariables
                  ? "填写变量"
                  : "复制完整正文"
            }}
          </PdButton>
        </footer>
      </template>
    </aside>
  </div>
</template>
