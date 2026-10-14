<script setup lang="ts">
import { computed } from "vue";

import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";
import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";

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
            <span class="category-pill">{{ prompt.categoryName }}</span>
            <h2>{{ prompt.title }}</h2>
          </div>
          <button
            class="icon-button"
            aria-label="关闭详情"
            @click="emit('close')"
          >
            ×
          </button>
        </header>
        <p class="drawer-description">
          {{ prompt.description || "没有补充说明" }}
        </p>
        <p
          v-if="template.error"
          class="template-error"
          data-test="template-error"
          role="alert"
        >
          {{ template.error.message }}。请编辑正文中的变量占位符后再复制。
        </p>
        <div class="tags">
          <span v-for="tag in prompt.tags" :key="tag">#{{ tag }}</span>
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
          <button class="ghost-button" @click="emit('edit', prompt)">
            编辑
          </button>
          <button
            class="primary-button"
            :disabled="Boolean(template.error)"
            @click="emit('copy', prompt)"
          >
            {{
              template.error
                ? "修正变量格式后复制"
                : hasVariables
                  ? "填写变量"
                  : "复制完整正文"
            }}
          </button>
        </footer>
      </template>
    </aside>
  </div>
</template>
