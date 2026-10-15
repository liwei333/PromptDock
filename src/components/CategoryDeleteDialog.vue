<script setup lang="ts">
import { computed, ref } from "vue";

import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdSelect, { type PdSelectOption } from "@/components/ui/PdSelect.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
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
const targetOptions = computed<PdSelectOption[]>(() =>
  targets.value.map((category) => ({
    value: category.id,
    label: category.name,
  })),
);

function requestCancel(): void {
  if (!props.busy) emit("cancel");
}

function confirmTransfer(): void {
  if (
    props.busy ||
    !targetId.value ||
    targetId.value === props.source.id ||
    !targets.value.some((category) => category.id === targetId.value)
  ) {
    return;
  }
  emit("confirm", props.source.id, targetId.value);
}
</script>

<template>
  <PdDialog
    :open="true"
    class="category-delete-dialog"
    title="删除分类 · 安全迁移"
    description="不会删除提示词内容"
    close-label="取消删除"
    :close-on-outside="!busy"
    @dismiss="requestCancel"
  >
    <div class="category-delete-warning">
      <strong>确认删除分类「{{ source.name }}」？</strong>
      <p>
        该分类包含
        {{ source.promptCount }} 条提示词。删除的只是分类，提示词会安全迁移。
      </p>
    </div>

    <label class="category-transfer-field">
      <span>提示词转移至 *</span>
      <PdSelect
        v-model="targetId"
        data-test="category-transfer-target"
        label="提示词转移至"
        placeholder="请选择目标分类"
        :options="targetOptions"
        :disabled="busy"
      />
    </label>

    <p class="category-delete-note">
      正文、UUID、标签、收藏、置顶顺序、复制统计与创建时间均保持不变。
    </p>
    <PdStatusMessage
      v-if="error"
      class="category-dialog-status"
      tone="danger"
      :message="error"
    />

    <template #footer>
      <PdButton
        data-test="cancel-category-delete"
        variant="ghost"
        :disabled="busy"
        @click="requestCancel"
      >
        取消
      </PdButton>
      <PdButton
        data-test="confirm-category-delete"
        variant="danger"
        :loading="busy"
        :disabled="!targetId"
        @click="confirmTransfer"
      >
        {{ busy ? "正在迁移…" : `确认删除并转移 ${source.promptCount} 条` }}
      </PdButton>
    </template>
  </PdDialog>
</template>
