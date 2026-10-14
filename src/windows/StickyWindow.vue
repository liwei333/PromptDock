<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { promptApi, windowApi } from "@/api/commands";
import { extractTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";

const prompts = ref<Prompt[]>([]);
const alwaysOnTop = ref(true);
const feedback = ref<{ id: string; text: string; error: boolean } | null>(null);
const loading = ref(true);
const switchingMode = ref(false);
const windowError = ref("");
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
  if (extractTemplateVariables(prompt.body).length) {
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

async function toggleAlwaysOnTop(): Promise<void> {
  alwaysOnTop.value = !alwaysOnTop.value;
  try {
    await windowApi.setStickySettings({ alwaysOnTop: alwaysOnTop.value });
  } catch {
    alwaysOnTop.value = !alwaysOnTop.value;
  }
}

async function enterMainMode(): Promise<void> {
  if (switchingMode.value) return;
  switchingMode.value = true;
  windowError.value = "";
  try {
    await windowApi.enterMainMode();
  } catch {
    windowError.value = "无法切换到完整模式";
  } finally {
    switchingMode.value = false;
  }
}

async function hideSticky(): Promise<void> {
  windowError.value = "";
  try {
    await windowApi.hideSticky();
  } catch {
    windowError.value = "无法收起便签";
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
        <button
          data-test="enter-main-mode"
          title="切换到完整模式"
          aria-label="切换到完整模式"
          :disabled="switchingMode"
          @click="enterMainMode"
        >
          <svg class="mode-window-icon" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.5" y="3" width="11" height="9.5" rx="1.5" />
            <path d="M3 5.5h10" />
          </svg>
        </button>
        <button title="收起便签" aria-label="收起便签" @click="hideSticky">
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
            v-if="extractTemplateVariables(prompt.body).length"
            class="row-template"
            >{{ "{}" }}</span
          >
          <span v-else class="row-copy">{{
            feedback?.id === prompt.id ? feedback.text : "复制"
          }}</span>
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
      <span
        class="sticky-window-status"
        :class="{ error: windowError }"
        aria-live="polite"
        >{{ windowError || "整行点击 · 复制全文" }}</span
      ><button
        data-test="manage-in-main"
        :disabled="switchingMode"
        @click="enterMainMode"
      >
        管理置顶 →
      </button>
    </footer>
  </main>
</template>
