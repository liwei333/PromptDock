<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import {
  extractTemplateVariables,
  renderTemplatePreview,
  renderTemplate,
} from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompt: Prompt }>();
const emit = defineEmits<{ copied: []; cancel: [] }>();
const names = computed(() => extractTemplateVariables(props.prompt.body));
const values = reactive<Record<string, string>>({});
const error = ref("");
const copying = ref(false);
const preview = computed(() =>
  renderTemplatePreview(props.prompt.body, values),
);

async function copy(): Promise<void> {
  error.value = "";
  try {
    copying.value = true;
    const text = renderTemplate(props.prompt.body, values);
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
    <div class="preview-block">
      <span>结果预览</span>
      <pre>{{ preview }}</pre>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <footer>
      <button class="ghost-button" @click="emit('cancel')">返回</button>
      <button class="primary-button" :disabled="copying" @click="copy">
        {{ copying ? "正在复制…" : "复制替换后的全文" }}
      </button>
    </footer>
  </section>
</template>
