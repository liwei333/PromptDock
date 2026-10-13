<script setup lang="ts">
import { onMounted, ref } from "vue";

import { windowApi } from "@/api/commands";
import type { RuntimeInfo } from "@/types/runtime";

const emit = defineEmits<{ close: [] }>();
const info = ref<RuntimeInfo | null>(null);
const error = ref("");

onMounted(async () => {
  try {
    info.value = await windowApi.runtimeInfo();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
});
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="runtime-dialog">
      <header>
        <div>
          <span class="eyebrow">本机运行信息</span>
          <h2>PromptDock 状态</h2>
        </div>
        <button
          class="icon-button"
          aria-label="关闭运行信息"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div v-if="info" class="runtime-list">
        <div>
          <span>应用版本</span><strong>V{{ info.version }}</strong>
        </div>
        <div>
          <span>全局快捷键</span
          ><strong
            >{{ info.shortcut.accelerator }} ·
            {{ info.shortcut.registered ? "已注册" : "不可用" }}</strong
          >
        </div>
        <div v-if="info.shortcut.error">
          <span>快捷键冲突</span
          ><strong class="danger-text">{{ info.shortcut.error }}</strong>
        </div>
        <div>
          <span>SQLite 文件</span><code>{{ info.dbPath }}</code>
        </div>
      </div>
      <p v-else-if="error" class="form-error">{{ error }}</p>
      <p v-else class="muted">正在读取本机状态…</p>
      <p class="privacy-note">
        提示词以明文 SQLite 保存在这台
        Mac。应用不创建账号、不请求网络，也不会自动粘贴到其他软件。
      </p>
      <footer>
        <span class="spacer" /><button
          class="primary-button"
          @click="emit('close')"
        >
          完成
        </button>
      </footer>
    </section>
  </div>
</template>
