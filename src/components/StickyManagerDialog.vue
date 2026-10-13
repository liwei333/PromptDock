<script setup lang="ts">
import { ref } from "vue";

import { promptApi } from "@/api/commands";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompts: Prompt[] }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const rows = ref([...props.prompts]);
const saving = ref(false);
const error = ref("");

function move(index: number, delta: number): void {
  const next = index + delta;
  if (next < 0 || next >= rows.value.length) return;
  [rows.value[index], rows.value[next]] = [rows.value[next], rows.value[index]];
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = "";
  try {
    await promptApi.reorderSticky(rows.value.map((item) => item.id));
    emit("changed");
    emit("close");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    saving.value = false;
  }
}

async function remove(prompt: Prompt): Promise<void> {
  try {
    await promptApi.setPinned(prompt.id, false);
    rows.value = rows.value.filter((item) => item.id !== prompt.id);
    emit("changed");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="sticky-manager">
      <header>
        <div>
          <span class="eyebrow">快捷便签</span>
          <h2>管理五个固定槽位</h2>
        </div>
        <button
          class="icon-button"
          aria-label="关闭便签管理"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <p>顺序会持久保存；复制次数变化不会改变这里的位置。</p>
      <div class="manager-list">
        <div v-for="(prompt, index) in rows" :key="prompt.id">
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <strong>{{ prompt.title }}</strong>
          <button
            :disabled="index === 0"
            aria-label="上移"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            :disabled="index === rows.length - 1"
            aria-label="下移"
            @click="move(index, 1)"
          >
            ↓
          </button>
          <button class="remove" @click="remove(prompt)">移除</button>
        </div>
        <div
          v-for="index in 5 - rows.length"
          :key="`empty-${index}`"
          class="manager-empty"
        >
          <span>{{ String(rows.length + index).padStart(2, "0") }}</span
          ><span>空位</span>
        </div>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <footer>
        <span class="spacer" /><button
          class="ghost-button"
          @click="emit('close')"
        >
          取消</button
        ><button class="primary-button" :disabled="saving" @click="save">
          {{ saving ? "保存中…" : "保存顺序" }}
        </button>
      </footer>
    </section>
  </div>
</template>
