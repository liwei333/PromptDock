<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import {
  inspectTemplateVariables,
  renderTemplatePreview,
  renderTemplate,
} from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt }>();
const emit = defineEmits<{ copied: []; cancel: [] }>();
const template = computed(() => inspectTemplateVariables(props.prompt.body));
const names = computed(() => template.value.variables);
const values = reactive<Record<string, string>>({});
const error = ref("");
const copying = ref(false);
const preview = computed(() =>
  template.value.error
    ? props.prompt.body
    : renderTemplatePreview(props.prompt.body, values),
);

async function copy(): Promise<void> {
  error.value = "";
  try {
    copying.value = true;
    const text = template.value.error
      ? props.prompt.body
      : renderTemplate(props.prompt.body, values);
    await copyPromptText({ id: props.prompt.id, text });
    emit("copied");
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : "复制失败，请检查变量后重试";
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <section class="variable-panel">
    <header>
      <div>
        <span class="eyebrow">变量模板</span>
        <h3>{{ prompt.title }}</h3>
      </div>
      <button
        class="icon-button"
        aria-label="关闭变量填写"
        @click="emit('cancel')"
      >
        ×
      </button>
    </header>
    <div class="variable-fields">
      <label v-for="name in names" :key="name">
        <span>{{ name }}</span>
        <input v-model="values[name]" :placeholder="`填写${name}`" />
      </label>
    </div>
    <p
      v-if="template.error"
      class="form-error"
      data-test="template-error"
      role="alert"
    >
      {{ template.error.message }}。将按原始正文复制。
    </p>
    <div class="preview-block">
      <span>结果预览</span>
      <pre>{{ preview }}</pre>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <footer>
      <button class="ghost-button" @click="emit('cancel')">返回</button>
      <button class="primary-button" :disabled="copying" @click="copy">
        {{
          copying
            ? "正在复制…"
            : template.error
              ? "复制原始正文"
              : "复制替换后的全文"
        }}
      </button>
    </footer>
  </section>
</template>
