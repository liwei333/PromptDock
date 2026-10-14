<script setup lang="ts">
import { ref, watch } from "vue";

import CategoryDeleteDialog from "@/components/CategoryDeleteDialog.vue";
import type { Category } from "@/types/prompt";

const props = defineProps<{
  categories: Category[];
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  close: [];
  create: [name: string];
  rename: [id: string, name: string];
  delete: [sourceId: string, targetId: string];
}>();

const creating = ref(false);
const newName = ref("");
const editingId = ref<string | null>(null);
const editingName = ref("");
const deleteSource = ref<Category | null>(null);
const localError = ref("");
let previousCount = props.categories.length;

watch(
  () => props.categories,
  (categories) => {
    if (creating.value && categories.length > previousCount) {
      creating.value = false;
      newName.value = "";
    }
    if (editingId.value) {
      const category = categories.find((item) => item.id === editingId.value);
      if (category && category.name === editingName.value.trim()) {
        editingId.value = null;
        editingName.value = "";
      }
    }
    if (
      deleteSource.value &&
      !categories.some((category) => category.id === deleteSource.value?.id)
    ) {
      deleteSource.value = null;
    }
    previousCount = categories.length;
  },
);

function submitCreate(): void {
  const name = newName.value.trim();
  if (!name) {
    localError.value = "请输入分类名称";
    return;
  }
  localError.value = "";
  emit("create", name);
}

function startRename(category: Category): void {
  localError.value = "";
  editingId.value = category.id;
  editingName.value = category.name;
}

function submitRename(): void {
  const name = editingName.value.trim();
  if (!editingId.value || !name) {
    localError.value = "请输入分类名称";
    return;
  }
  localError.value = "";
  emit("rename", editingId.value, name);
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section
      class="category-manager-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-manager-title"
    >
      <header>
        <div>
          <h2 id="category-manager-title">分类管理</h2>
          <p>新增 · 重命名 · 删除 · 安全迁移提示词</p>
        </div>
        <button type="button" class="icon-button" aria-label="关闭分类管理" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="category-manager-intro">
        <span aria-hidden="true">▢</span>
        <p><strong>分类只是组织提示词的方式。</strong> 删除分类前必须选择新的归属分类，提示词不会被删除。</p>
      </div>

      <div class="category-manager-toolbar">
        <strong>全部分类 <small>({{ categories.length }})</small></strong>
        <button
          type="button"
          class="primary-button"
          data-test="open-category-create"
          @click="creating = true; localError = ''"
        >
          ＋ 新增分类
        </button>
      </div>

      <form v-if="creating" class="category-inline-form" @submit.prevent="submitCreate">
        <input
          v-model="newName"
          data-test="category-create-input"
          maxlength="18"
          autofocus
          placeholder="分类名称"
        />
        <button type="button" class="ghost-button" @click="creating = false">取消</button>
        <button
          type="button"
          class="primary-button"
          data-test="submit-category-create"
          :disabled="busy"
          @click="submitCreate"
        >
          创建
        </button>
      </form>

      <div class="category-manager-list">
        <div
          v-for="category in categories"
          :key="category.id"
          class="category-manager-row"
          data-test="category-row"
        >
          <template v-if="editingId === category.id">
            <input
              v-model="editingName"
              data-test="category-rename-input"
              maxlength="18"
              @keydown.esc="editingId = null"
              @keydown.enter.prevent="submitRename"
            />
            <button type="button" class="ghost-button" @click="editingId = null">取消</button>
            <button
              type="button"
              class="primary-button"
              data-test="submit-category-rename"
              :disabled="busy"
              @click="submitRename"
            >
              保存
            </button>
          </template>
          <template v-else>
            <span class="category-color" :style="{ background: category.color }" aria-hidden="true">▢</span>
            <span class="category-manager-name">
              <strong>{{ category.name }}</strong>
              <small>{{ category.promptCount }} 条提示词</small>
            </span>
            <button
              type="button"
              class="ghost-button"
              :data-test="`rename-category-${category.id}`"
              :disabled="busy"
              @click="startRename(category)"
            >
              重命名
            </button>
            <button
              type="button"
              class="danger-button"
              :data-test="`delete-category-${category.id}`"
              :disabled="busy || categories.length <= 1"
              :title="categories.length <= 1 ? '不能删除最后一个分类' : `删除 ${category.name}`"
              @click="deleteSource = category"
            >
              删除
            </button>
          </template>
        </div>
      </div>

      <p v-if="localError || error" class="form-error" role="alert">
        {{ localError || error }}
      </p>
      <footer>
        <button type="button" class="ghost-button" @click="emit('close')">完成</button>
      </footer>

      <CategoryDeleteDialog
        v-if="deleteSource"
        :source="deleteSource"
        :categories="categories"
        :busy="busy"
        :error="error"
        @cancel="deleteSource = null"
        @confirm="(sourceId, targetId) => emit('delete', sourceId, targetId)"
      />
    </section>
  </div>
</template>
