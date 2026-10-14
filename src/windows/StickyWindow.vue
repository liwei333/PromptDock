<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { promptApi, windowApi } from "@/api/commands";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";

const prompts = ref<Prompt[]>([]);
const alwaysOnTop = ref(true);
const feedback = ref<{ id: string; text: string; error: boolean } | null>(null);
const loading = ref(true);
let stopListening: (() => void) | null = null;
const slots = computed(() =>
  Array.from({ length: 5 }, (_, index) => prompts.value[index] ?? null),
);

async function load(): Promise<void> {
  try {
    prompts.value = await promptApi.listSticky();
  } finally {
    loading.value = false;
  }
}

async function activate(prompt: Prompt): Promise<void> {
  const template = inspectTemplateVariables(prompt.body);
  if (!template.error && template.variables.length) {
    await windowApi.showQuick(prompt.id);
    return;
  }
  try {
    await copyPromptText({ id: prompt.id, text: prompt.body });
    feedback.value = { id: prompt.id, text: "已复制", error: false };
  } catch (reason) {
    feedback.value = {
      id: prompt.id,
      text: reason instanceof Error ? reason.message : "复制失败",
      error: true,
    };
  }
  window.setTimeout(() => (feedback.value = null), 1600);
}

function promptActionLabel(prompt: Prompt): string {
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) return "复制";
  return template.variables.length ? "{}" : "复制";
}

async function toggleAlwaysOnTop(): Promise<void> {
  alwaysOnTop.value = !alwaysOnTop.value;
  try {
    await windowApi.setStickySettings({ alwaysOnTop: alwaysOnTop.value });
  } catch {
    alwaysOnTop.value = !alwaysOnTop.value;
  }
}

function startDragging(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest("button")) return;
  if ("__TAURI_INTERNALS__" in window) void getCurrentWindow().startDragging();
}

onMounted(async () => {
  await load();
  if ("__TAURI_INTERNALS__" in window) {
    const settings = await windowApi.getStickySettings();
    alwaysOnTop.value = settings.alwaysOnTop;
    stopListening = await listen("prompts-changed", () => void load());
  }
});
onBeforeUnmount(() => stopListening?.());
</script>

<template>
  <main class="sticky-window">
    <header class="sticky-titlebar" @mousedown="startDragging">
      <div>
        <span class="sticky-pin">⌁</span><strong>快捷便签</strong
        ><small>{{ prompts.length }}/5</small>
      </div>
      <div>
        <button
          :class="{ active: alwaysOnTop }"
          :title="alwaysOnTop ? '关闭始终置顶' : '开启始终置顶'"
          aria-label="切换始终置顶"
          @click="toggleAlwaysOnTop"
        >
          ⌖
        </button>
        <button title="打开主窗口管理" aria-label="打开主窗口管理">⋯</button>
        <button
          title="收起便签"
          aria-label="收起便签"
          @click="windowApi.hideSticky()"
        >
          ×
        </button>
      </div>
    </header>
    <section class="sticky-list" :aria-busy="loading">
      <template
        v-for="(prompt, index) in slots"
        :key="prompt?.id ?? `empty-${index}`"
      >
        <button
          v-if="prompt"
          data-test="sticky-slot"
          class="sticky-row"
          :title="prompt.title"
          @click="activate(prompt)"
        >
          <span class="slot-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <strong>{{ prompt.title }}</strong>
          <span
            :class="
              inspectTemplateVariables(prompt.body).variables.length
                ? 'row-template'
                : 'row-copy'
            "
            >{{
              feedback?.id === prompt.id
                ? feedback.text
                : promptActionLabel(prompt)
            }}</span
          >
        </button>
        <div v-else data-test="sticky-slot" class="sticky-row empty">
          <span class="slot-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <span>空位 {{ index + 1 }} · 在主库中选择置顶</span>
        </div>
      </template>
    </section>
    <footer class="sticky-footer">
      <span>整行点击 · 复制全文</span><button>管理置顶 →</button>
    </footer>
  </main>
</template>
