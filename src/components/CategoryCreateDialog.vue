<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";

import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";

const emit = defineEmits<{ create: [name: string]; close: [] }>();
const name = ref("");
const input = ref<HTMLInputElement | null>(null);
const error = computed(() => {
  const length = Array.from(name.value.trim()).length;
  if (length === 0) return "请输入分类名称";
  if (length > 18) return "分类名称不能超过 18 个字符";
  return "";
});

function submit(): void {
  if (!error.value) emit("create", name.value.trim());
}

onMounted(async () => {
  await nextTick();
  input.value?.focus();
});
</script>

<template>
  <PdDialog
    :open="true"
    class="category-dialog"
    title="新建分类"
    description="创建一个仅保存在本机的新分类"
    close-label="关闭分类编辑"
    @dismiss="emit('close')"
  >
    <form class="category-create-form" @submit.prevent="submit">
      <label>
        <span>分类名称</span>
        <input
          ref="input"
          v-model="name"
          maxlength="18"
          placeholder="例如：行业研究"
        />
      </label>
      <PdStatusMessage v-if="error" tone="danger" live="off" :message="error" />
    </form>

    <template #footer>
      <PdButton variant="ghost" @click="emit('close')">取消</PdButton>
      <PdButton variant="primary" :disabled="Boolean(error)" @click="submit">
        创建分类
      </PdButton>
    </template>
  </PdDialog>
</template>
