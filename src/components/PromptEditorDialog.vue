<script setup lang="ts">
import { computed, reactive } from "vue";
import { confirm } from "@tauri-apps/plugin-dialog";

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
const tagsText = computed({
  get: () => form.tags.join("，"),
  set: (value: string) => {
    form.tags = value
      .split(/[,，]/u)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10);
  },
});
const validation = computed(() => {
  if (!form.title.trim()) return "请输入标题";
  if (Array.from(form.title.trim()).length > 80)
    return "标题不能超过 80 个字符";
  if (!form.body.trim()) return "请输入提示词正文";
  if (!form.categoryId) return "请选择分类";
  return "";
});

async function close(): Promise<void> {
  if (
    JSON.stringify(form) !== initial &&
    !(await confirm("当前修改尚未保存，确定放弃吗？", {
      title: "放弃未保存修改？",
      kind: "warning",
    }))
  ) {
    return;
  }
  emit("close");
}

function save(): void {
  if (validation.value) return;
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
  <div class="modal-backdrop" @mousedown.self="close">
    <form
      class="editor-dialog"
      @submit.prevent="save"
      @keydown.esc.prevent="close"
    >
      <header>
        <div>
          <span class="eyebrow">{{
            prompt ? "编辑提示词" : "新建提示词"
          }}</span>
          <h2>{{ prompt ? prompt.title : "把常用工作流保存到本机" }}</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="关闭编辑器"
          @click="close"
        >
          ×
        </button>
      </header>
      <div class="form-grid">
        <label class="span-2">
          <span>标题 *</span>
          <input
            v-model="form.title"
            autofocus
            maxlength="80"
            placeholder="例如：严谨的代码审查"
          />
        </label>
        <label>
          <span>分类 *</span>
          <select v-model="form.categoryId">
            <option
              v-for="category in categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </label>
        <label>
          <span>标签</span>
          <input v-model="tagsText" placeholder="用逗号分隔，最多 10 个" />
        </label>
        <label class="span-2">
          <span>说明</span>
          <input
            v-model="form.description"
            maxlength="160"
            placeholder="一句话说明使用场景"
          />
        </label>
        <label class="span-2">
          <span>提示词正文 *</span>
          <textarea
            v-model="form.body"
            rows="12"
            placeholder="支持多行正文；变量写作 {{项目名称}}"
          />
        </label>
      </div>
      <div class="toggle-row">
        <label
          ><input v-model="form.isFavorite" type="checkbox" /> 加入收藏</label
        >
        <label
          ><input v-model="form.isPinned" type="checkbox" /> 加入快捷便签（最多
          5 条）</label
        >
      </div>
      <p v-if="validation || serverError" class="form-error" role="alert">
        {{ serverError || validation }}
      </p>
      <footer>
        <button
          v-if="prompt"
          type="button"
          class="danger-button"
          @click="emit('delete', prompt)"
        >
          删除提示词
        </button>
        <span class="spacer" />
        <button type="button" class="ghost-button" @click="close">取消</button>
        <button
          class="primary-button"
          :disabled="Boolean(validation) || saving"
        >
          {{ saving ? "正在保存…" : "保存到本机" }}
        </button>
      </footer>
    </form>
  </div>
</template>
