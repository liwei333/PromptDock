<script setup lang="ts">
import { Folder, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { ref, useId, watch } from "vue";

import CategoryDeleteDialog from "@/components/CategoryDeleteDialog.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
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
const finalCategoryHelpId = useId();
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

function requestClose(): void {
  if (!props.busy && !deleteSource.value) emit("close");
}

function submitCreate(): void {
  if (props.busy) return;
  const name = newName.value.trim();
  if (!name) {
    localError.value = "请输入分类名称";
    return;
  }
  localError.value = "";
  emit("create", name);
}

function startRename(category: Category): void {
  if (props.busy) return;
  localError.value = "";
  editingId.value = category.id;
  editingName.value = category.name;
}

function submitRename(): void {
  if (props.busy) return;
  const name = editingName.value.trim();
  if (!editingId.value || !name) {
    localError.value = "请输入分类名称";
    return;
  }
  localError.value = "";
  emit("rename", editingId.value, name);
}

function requestDelete(category: Category): void {
  if (props.busy || props.categories.length <= 1) return;
  deleteSource.value = category;
}
</script>

<template>
  <PdDialog
    :open="true"
    class="category-manager-dialog"
    title="分类管理"
    description="新增、重命名、删除与安全迁移提示词"
    close-label="关闭分类管理"
    :close-on-outside="!busy && !deleteSource"
    @dismiss="requestClose"
  >
    <div class="category-manager-intro">
      <Folder aria-hidden="true" />
      <p>
        <strong>分类只是组织提示词的方式。</strong>
        删除分类前必须选择新的归属分类，提示词不会被删除。
      </p>
    </div>

    <div class="category-manager-toolbar">
      <strong
        >全部分类 <small>({{ categories.length }})</small></strong
      >
      <PdButton
        variant="primary"
        size="sm"
        data-test="open-category-create"
        :disabled="busy"
        @click="
          creating = true;
          localError = '';
        "
      >
        <template #leading><Plus aria-hidden="true" /></template>
        新增分类
      </PdButton>
    </div>

    <form
      v-if="creating"
      class="category-inline-form"
      @submit.prevent="submitCreate"
    >
      <input
        v-model="newName"
        data-test="category-create-input"
        maxlength="18"
        autofocus
        placeholder="分类名称"
        :disabled="busy"
        @keydown.enter.prevent="submitCreate"
      />
      <PdButton
        variant="ghost"
        size="sm"
        :disabled="busy"
        @click="creating = false"
      >
        取消
      </PdButton>
      <PdButton
        variant="primary"
        size="sm"
        data-test="submit-category-create"
        :loading="busy"
        @click="submitCreate"
      >
        创建
      </PdButton>
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
            :disabled="busy"
            @keydown.esc="editingId = null"
            @keydown.enter.prevent="submitRename"
          />
          <PdButton
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="editingId = null"
          >
            取消
          </PdButton>
          <PdButton
            variant="primary"
            size="sm"
            data-test="submit-category-rename"
            :loading="busy"
            @click="submitRename"
          >
            保存
          </PdButton>
        </template>
        <template v-else>
          <span
            class="category-color"
            :style="{ background: category.color }"
            aria-hidden="true"
          >
            <Folder />
          </span>
          <span class="category-manager-name">
            <strong>{{ category.name }}</strong>
            <small>{{ category.promptCount }} 条提示词</small>
          </span>
          <PdIconButton
            :data-test="`rename-category-${category.id}`"
            :label="`重命名 ${category.name}`"
            :tooltip="`重命名 ${category.name}`"
            :icon="Pencil"
            :disabled="busy"
            @click="startRename(category)"
          />
          <PdIconButton
            :data-test="`delete-category-${category.id}`"
            :label="`删除 ${category.name}`"
            :tooltip="
              categories.length <= 1
                ? `至少保留一个分类，无法删除 ${category.name}`
                : `删除 ${category.name}`
            "
            :icon="Trash2"
            :disabled="busy"
            :aria-disabled="categories.length <= 1 ? 'true' : undefined"
            :aria-describedby="
              categories.length <= 1 ? finalCategoryHelpId : undefined
            "
            @click="requestDelete(category)"
          />
        </template>
      </div>
    </div>

    <p
      v-if="categories.length <= 1"
      :id="finalCategoryHelpId"
      class="category-final-note"
    >
      至少保留一个分类，无法删除最后一个分类。
    </p>

    <PdStatusMessage
      v-if="localError || error"
      class="category-dialog-status"
      tone="danger"
      :message="localError || error || ''"
    />

    <template #footer>
      <PdButton variant="secondary" :disabled="busy" @click="requestClose">
        完成
      </PdButton>
    </template>

    <CategoryDeleteDialog
      v-if="deleteSource"
      :source="deleteSource"
      :categories="categories"
      :busy="busy"
      :error="error"
      @cancel="deleteSource = null"
      @confirm="(sourceId, targetId) => emit('delete', sourceId, targetId)"
    />
  </PdDialog>
</template>
