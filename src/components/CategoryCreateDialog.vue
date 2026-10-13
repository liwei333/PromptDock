<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";

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
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <form
      class="category-dialog"
      @submit.prevent="submit"
      @keydown.esc.prevent="emit('close')"
    >
      <header>
        <div>
          <span class="eyebrow">分类管理</span>
          <h2>新建分类</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="关闭分类编辑"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <label
        ><span>分类名称</span
        ><input
          ref="input"
          v-model="name"
          maxlength="18"
          placeholder="例如：行业研究"
      /></label>
      <p v-if="error" class="form-error">{{ error }}</p>
      <footer>
        <span class="spacer" /><button
          type="button"
          class="ghost-button"
          @click="emit('close')"
        >
          取消</button
        ><button class="primary-button" :disabled="Boolean(error)">
          创建分类
        </button>
      </footer>
    </form>
  </div>
</template>
