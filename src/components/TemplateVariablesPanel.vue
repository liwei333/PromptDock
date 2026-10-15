<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, reactive, ref, useId } from "vue";

import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
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
const titleId = useId();
const preview = computed(() =>
  template.value.error
    ? props.prompt.body
    : renderTemplatePreview(props.prompt.body, values),
);

async function copy(): Promise<void> {
  if (copying.value) return;
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
  <section class="variable-panel" :aria-labelledby="titleId">
    <header>
      <div>
        <span class="eyebrow">变量模板</span>
        <h3 :id="titleId">{{ prompt.title }}</h3>
      </div>
      <PdIconButton label="关闭变量填写" :icon="X" @click="emit('cancel')" />
    </header>
    <div class="variable-fields">
      <label v-for="name in names" :key="name">
        <span>{{ name }}</span>
        <input v-model="values[name]" :placeholder="'填写' + name" />
      </label>
    </div>
    <PdStatusMessage
      v-if="template.error"
      class="template-error"
      data-test="template-error"
      tone="danger"
      :message="template.error.message + '。将按原始正文复制。'"
    />
    <div class="preview-block">
      <span>结果预览</span>
      <pre>{{ preview }}</pre>
    </div>
    <PdStatusMessage v-if="error" tone="danger" :message="error" />
    <footer>
      <PdButton variant="ghost" @click="emit('cancel')">返回</PdButton>
      <PdButton
        data-test="copy-template"
        variant="primary"
        :loading="copying"
        @click="copy"
      >
        {{
          copying
            ? "正在复制…"
            : template.error
              ? "复制原始正文"
              : "复制替换后的全文"
        }}
      </PdButton>
    </footer>
  </section>
</template>
