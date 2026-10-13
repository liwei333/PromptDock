<script setup lang="ts">
import { ref } from "vue";

import type { ImportMode, ImportPreview } from "@/types/backup";

defineProps<{ preview: ImportPreview; busy?: boolean; error?: string }>();
const emit = defineEmits<{ commit: [mode: ImportMode]; cancel: [] }>();
const mode = ref<ImportMode>("merge");
</script>

<template>
  <div class="modal-backdrop">
    <section class="import-preview">
      <header>
        <div>
          <span class="eyebrow">已完成整文件校验</span>
          <h2>确认导入备份</h2>
        </div>
        <button
          class="icon-button"
          aria-label="取消导入"
          @click="emit('cancel')"
        >
          ×
        </button>
      </header>
      <div class="preview-stats">
        <div>
          <strong>{{ preview.summary.promptCount }}</strong
          ><span>{{ " 条提示词" }}</span>
        </div>
        <div>
          <strong>{{ preview.summary.categoryCount }}</strong
          ><span>{{ " 个分类" }}</span>
        </div>
        <div>
          <strong>{{ preview.summary.idConflicts }}</strong
          ><span>{{ " 个 ID 冲突" }}</span>
        </div>
        <div>
          <strong>{{ preview.summary.categoriesAdded }}</strong
          ><span>{{ " 个新增分类" }}</span>
        </div>
      </div>
      <p class="validation-note">
        ✓ 无效记录 {{ preview.summary.invalidRecords }} 条 · 来源格式 V{{
          preview.summary.sourceVersion
        }}
      </p>
      <div class="import-modes">
        <label :class="{ active: mode === 'merge' }"
          ><input v-model="mode" type="radio" value="merge" /><span
            ><strong>合并导入（推荐）</strong
            ><small>现有内容不会被覆盖；冲突项创建“导入副本”。</small></span
          ></label
        >
        <label :class="{ active: mode === 'replace' }"
          ><input v-model="mode" type="radio" value="replace" /><span
            ><strong>替换现有库</strong
            ><small
              >先创建安全备份，再用文件内容替换当前分类和提示词。</small
            ></span
          ></label
        >
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <footer>
        <button class="ghost-button" @click="emit('cancel')">
          取消，不写入</button
        ><span class="spacer" /><button
          data-test="commit-import"
          class="primary-button"
          :class="{ danger: mode === 'replace' }"
          :disabled="busy"
          @click="emit('commit', mode)"
        >
          {{
            busy ? "正在事务导入…" : mode === "merge" ? "合并导入" : "确认替换"
          }}
        </button>
      </footer>
    </section>
  </div>
</template>
