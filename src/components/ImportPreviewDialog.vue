<script setup lang="ts">
import { CircleCheck } from "lucide-vue-next";
import { ref } from "vue";

import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
import type { ImportMode, ImportPreview } from "@/types/backup";

const props = defineProps<{
  preview: ImportPreview;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ commit: [mode: ImportMode]; cancel: [] }>();
const mode = ref<ImportMode>("merge");

function requestCancel(): void {
  if (!props.busy) emit("cancel");
}

function commit(): void {
  if (!props.busy) emit("commit", mode.value);
}
</script>

<template>
  <PdDialog
    :open="true"
    class="import-preview"
    title="确认导入备份"
    description="已完成整文件校验；确认前不会写入数据库"
    close-label="取消导入"
    :close-on-outside="!busy"
    @dismiss="requestCancel"
  >
    <div class="preview-stats">
      <div>
        <strong>{{ preview.summary.promptCount }}</strong>
        <span> 条提示词</span>
      </div>
      <div>
        <strong>{{ preview.summary.categoryCount }}</strong>
        <span> 个分类</span>
      </div>
      <div>
        <strong>{{ preview.summary.idConflicts }}</strong>
        <span> 个 ID 冲突</span>
      </div>
      <div>
        <strong>{{ preview.summary.categoriesAdded }}</strong>
        <span> 个新增分类</span>
      </div>
    </div>
    <p class="validation-note">
      <CircleCheck aria-hidden="true" />
      <span
        >无效记录 {{ preview.summary.invalidRecords }} 条 · 来源格式 V{{
          preview.summary.sourceVersion
        }}</span
      >
    </p>
    <div class="import-modes">
      <label :class="{ active: mode === 'merge' }">
        <input v-model="mode" type="radio" value="merge" :disabled="busy" />
        <span>
          <strong>合并导入（推荐）</strong>
          <small>现有内容不会被覆盖；冲突项创建“导入副本”。</small>
        </span>
      </label>
      <label :class="{ active: mode === 'replace' }">
        <input v-model="mode" type="radio" value="replace" :disabled="busy" />
        <span>
          <strong>替换现有库</strong>
          <small>先创建安全备份，再用文件内容替换当前分类和提示词。</small>
        </span>
      </label>
    </div>
    <PdStatusMessage v-if="error" tone="danger" :message="error" />

    <template #footer>
      <PdButton variant="ghost" :disabled="busy" @click="requestCancel">
        取消，不写入
      </PdButton>
      <PdButton
        data-test="commit-import"
        :variant="mode === 'replace' ? 'danger' : 'primary'"
        :loading="busy"
        @click="commit"
      >
        {{
          busy ? "正在事务导入…" : mode === "merge" ? "合并导入" : "确认替换"
        }}
      </PdButton>
    </template>
  </PdDialog>
</template>
