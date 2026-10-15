<script setup lang="ts">
import { confirm } from "@tauri-apps/plugin-dialog";
import { computed, reactive, ref } from "vue";

import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdSelect, { type PdSelectOption } from "@/components/ui/PdSelect.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
import type { Category, Prompt, PromptInput } from "@/types/prompt";

const props = defineProps<{
  prompt?: Prompt | null;
  categories: Category[];
  saving?: boolean;
  serverError?: string;
}>();
const emit = defineEmits<{
  save: [input: PromptInput, id?: string];
  close: [];
  delete: [prompt: Prompt];
}>();
const general =
  props.categories.find((item) => item.name === "通用效率")?.id ??
  props.categories[0]?.id ??
  "";
const form = reactive<PromptInput>({
  title: props.prompt?.title ?? "",
  description: props.prompt?.description ?? "",
  body: props.prompt?.body ?? "",
  categoryId: props.prompt?.categoryId ?? general,
  tags: [...(props.prompt?.tags ?? [])],
  isFavorite: props.prompt?.isFavorite ?? false,
  isPinned: props.prompt?.isPinned ?? false,
});
const initial = JSON.stringify(form);
const confirmingClose = ref(false);
const categoryOptions = computed<PdSelectOption[]>(() =>
  props.categories.map((category) => ({
    value: category.id,
    label: category.name,
  })),
);
const tagsText = ref(form.tags.join("，"));
const validation = computed(() => {
  if (!form.title.trim()) return "请输入标题";
  if (Array.from(form.title.trim()).length > 80)
    return "标题不能超过 80 个字符";
  if (!form.body.trim()) return "请输入提示词正文";
  if (!form.categoryId) return "请选择分类";
  if (form.tags.length > 10) return "标签不能超过 10 个";
  return "";
});
const dialogTitle = computed(() =>
  props.prompt ? "编辑提示词" : "新建提示词",
);
const dialogDescription = computed(() =>
  props.prompt ? props.prompt.title : "把常用工作流保存到本机",
);

function updateTextField(
  field: "title" | "description" | "body",
  event: Event,
): void {
  const input = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (props.saving) {
    input.value = form[field];
    return;
  }
  form[field] = input.value;
}

function updateTags(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (props.saving) {
    input.value = tagsText.value;
    return;
  }
  tagsText.value = input.value;
  form.tags = tagsText.value
    .split(/[,，]/u)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function updateCategory(categoryId: string): void {
  if (!props.saving) form.categoryId = categoryId;
}

function updateBoolean(field: "isFavorite" | "isPinned", event: Event): void {
  const input = event.target as HTMLInputElement;
  if (props.saving) {
    input.checked = form[field];
    return;
  }
  form[field] = input.checked;
}

async function requestClose(): Promise<void> {
  if (props.saving || confirmingClose.value) return;
  if (JSON.stringify(form) !== initial) {
    confirmingClose.value = true;
    try {
      const shouldClose = await confirm("当前修改尚未保存，确定放弃吗？", {
        title: "放弃未保存修改？",
        kind: "warning",
      });
      if (!shouldClose) return;
    } finally {
      confirmingClose.value = false;
    }
  }
  emit("close");
}

function save(): void {
  if (validation.value || props.saving) return;
  emit(
    "save",
    {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      tags: [...form.tags],
    },
    props.prompt?.id,
  );
}
</script>

<template>
  <PdDialog
    :open="true"
    class="editor-dialog"
    :title="dialogTitle"
    :description="dialogDescription"
    close-label="关闭编辑器"
    :close-on-outside="!saving"
    @dismiss="requestClose"
  >
    <form class="editor-form" @submit.prevent="save">
      <div class="form-grid">
        <label class="span-2">
          <span>标题 *</span>
          <input
            :value="form.title"
            data-test="prompt-title"
            autofocus
            maxlength="80"
            placeholder="例如：严谨的代码审查"
            :disabled="saving"
            @input="updateTextField('title', $event)"
          />
        </label>
        <label>
          <span>分类 *</span>
          <PdSelect
            :model-value="form.categoryId"
            label="分类"
            placeholder="请选择分类"
            :options="categoryOptions"
            :disabled="saving"
            @update:model-value="updateCategory"
          />
        </label>
        <label>
          <span>标签</span>
          <input
            :value="tagsText"
            data-test="prompt-tags"
            placeholder="用逗号分隔，最多 10 个"
            :disabled="saving"
            @input="updateTags"
          />
        </label>
        <label class="span-2">
          <span>说明</span>
          <input
            :value="form.description"
            maxlength="160"
            placeholder="一句话说明使用场景"
            :disabled="saving"
            @input="updateTextField('description', $event)"
          />
        </label>
        <label class="span-2">
          <span>提示词正文 *</span>
          <textarea
            :value="form.body"
            rows="12"
            placeholder="支持多行正文；变量写作 {{项目名称}}"
            :disabled="saving"
            @input="updateTextField('body', $event)"
          />
        </label>
      </div>
      <div class="toggle-row">
        <label>
          <input
            type="checkbox"
            :checked="form.isFavorite"
            :disabled="saving"
            @change="updateBoolean('isFavorite', $event)"
          />
          加入收藏
        </label>
        <label>
          <input
            type="checkbox"
            :checked="form.isPinned"
            :disabled="saving"
            @change="updateBoolean('isPinned', $event)"
          />
          加入快捷便签（最多 5 条）
        </label>
      </div>
      <PdStatusMessage
        v-if="validation || serverError"
        class="editor-status"
        tone="danger"
        :message="serverError || validation"
      />
    </form>

    <template #footer>
      <PdButton
        v-if="prompt"
        class="editor-delete"
        variant="danger"
        :disabled="saving"
        @click="emit('delete', prompt)"
      >
        删除提示词
      </PdButton>
      <span class="spacer" />
      <PdButton
        data-test="cancel-prompt-edit"
        variant="ghost"
        :disabled="saving"
        @click="requestClose"
      >
        取消
      </PdButton>
      <PdButton
        data-test="save-prompt"
        variant="primary"
        :loading="saving"
        :disabled="Boolean(validation)"
        @click="save"
      >
        {{ saving ? "正在保存…" : "保存到本机" }}
      </PdButton>
    </template>
  </PdDialog>
</template>
