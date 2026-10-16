<script setup lang="ts">
import { ArrowDown, ArrowUp } from "lucide-vue-next";
import { ref, watch } from "vue";

import { promptApi } from "@/api/commands";
import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
import type { Prompt } from "@/types/prompt";

const props = defineProps<{ prompts: Prompt[] }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const rows = ref([...props.prompts].slice(0, 5));
const locallyDirty = ref(false);
const saving = ref(false);
const removingId = ref<string | null>(null);
const error = ref("");

watch(
  () => props.prompts,
  (prompts) => {
    if (!locallyDirty.value) rows.value = [...prompts].slice(0, 5);
  },
);

function requestClose(): void {
  if (!saving.value && !removingId.value) emit("close");
}

function move(index: number, delta: number): void {
  const next = index + delta;
  if (next < 0 || next >= rows.value.length) return;
  [rows.value[index], rows.value[next]] = [rows.value[next], rows.value[index]];
  locallyDirty.value = true;
}

async function save(): Promise<void> {
  if (saving.value || removingId.value) return;
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
  if (saving.value || removingId.value) return;
  removingId.value = prompt.id;
  error.value = "";
  try {
    await promptApi.setPinned(prompt.id, false);
    locallyDirty.value = true;
    rows.value = rows.value.filter((item) => item.id !== prompt.id);
    emit("changed");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    removingId.value = null;
  }
}
</script>

<template>
  <PdDialog
    :open="true"
    class="sticky-manager"
    title="管理五个固定槽位"
    description="顺序会持久保存；复制次数变化不会改变这里的位置"
    close-label="关闭便签管理"
    :close-on-outside="!saving && !removingId"
    @dismiss="requestClose"
  >
    <div class="manager-list">
      <div
        v-for="(prompt, index) in rows"
        :key="prompt.id"
        data-test="sticky-manager-row"
      >
        <span>{{ String(index + 1).padStart(2, "0") }}</span>
        <strong>{{ prompt.title }}</strong>
        <PdIconButton
          label="上移"
          :tooltip="'上移 ' + prompt.title"
          :icon="ArrowUp"
          :disabled="index === 0 || saving || Boolean(removingId)"
          @click="move(index, -1)"
        />
        <PdIconButton
          label="下移"
          :tooltip="'下移 ' + prompt.title"
          :icon="ArrowDown"
          :disabled="index === rows.length - 1 || saving || Boolean(removingId)"
          @click="move(index, 1)"
        />
        <PdButton
          class="remove"
          variant="ghost"
          size="sm"
          :loading="removingId === prompt.id"
          :disabled="saving || Boolean(removingId)"
          @click="remove(prompt)"
        >
          移除
        </PdButton>
      </div>
      <div
        v-for="index in 5 - rows.length"
        :key="'empty-' + index"
        class="manager-empty"
      >
        <span>{{ String(rows.length + index).padStart(2, "0") }}</span>
        <span>空位</span>
      </div>
    </div>
    <PdStatusMessage v-if="error" tone="danger" :message="error" />

    <template #footer>
      <PdButton
        variant="ghost"
        :disabled="saving || Boolean(removingId)"
        @click="requestClose"
      >
        取消
      </PdButton>
      <PdButton
        data-test="save-sticky-order"
        variant="primary"
        :loading="saving"
        :disabled="Boolean(removingId)"
        @click="save"
      >
        {{ saving ? "保存中…" : "保存顺序" }}
      </PdButton>
    </template>
  </PdDialog>
</template>
