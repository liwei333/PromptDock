<script setup lang="ts">
import { computed, ref } from "vue";

import type { Category } from "@/types/prompt";

const props = defineProps<{
  source: Category;
  categories: Category[];
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  confirm: [sourceId: string, targetId: string];
  cancel: [];
}>();

const targetId = ref("");
const targets = computed(() =>
  props.categories.filter((category) => category.id !== props.source.id),
);

function confirmTransfer(): void {
  if (!targetId.value || targetId.value === props.source.id) return;
  emit("confirm", props.source.id, targetId.value);
}
</script>

<template>
  <div class="modal-backdrop category-delete-layer">
    <section
      class="category-delete-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-delete-title"
    >
      <header>
        <div>
          <h2 id="category-delete-title">删除分类 · 安全迁移</h2>
          <p>不会删除提示词内容</p>
        </div>
        <button type="button" class="icon-button" aria-label="取消删除" @click="emit('cancel')">
          ×
        </button>
      </header>

      <div class="category-delete-warning">
        <strong>确认删除分类「{{ source.name }}」？</strong>
        <p>
          该分类包含 {{ source.promptCount }} 条提示词。删除的只是分类，提示词会安全迁移。
        </p>
      </div>

      <label class="category-transfer-field">
        <span>提示词转移至 *</span>
        <select v-model="targetId" data-test="category-transfer-target" :disabled="busy">
          <option value="" disabled>请选择目标分类</option>
          <option v-for="category in targets" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </label>

      <p class="category-delete-note">
        正文、UUID、标签、收藏、置顶顺序、复制统计与创建时间均保持不变。
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <footer>
        <button
          type="button"
          class="ghost-button"
          data-test="cancel-category-delete"
          :disabled="busy"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="danger-button"
          data-test="confirm-category-delete"
          :disabled="!targetId || busy"
          @click="confirmTransfer"
        >
          {{ busy ? "正在迁移…" : `确认删除并转移 ${source.promptCount} 条` }}
        </button>
      </footer>
    </section>
  </div>
</template>
