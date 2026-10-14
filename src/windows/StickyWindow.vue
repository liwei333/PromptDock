<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { promptApi, windowApi } from "@/api/commands";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";
import type { StickyDensity } from "@/types/runtime";

const prompts = ref<Prompt[]>([]);
const alwaysOnTop = ref(true);
const density = ref<StickyDensity>("comfortable");
const feedback = ref<{ id: string; text: string; error: boolean } | null>(null);
const loading = ref(true);
const switchingMode = ref(false);
const densityBusy = ref(false);
const settingsOpen = ref(false);
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
  return template.variables.length ? "填写变量" : "点击复制";
}

function promptHasVariables(prompt: Prompt): boolean {
  const template = inspectTemplateVariables(prompt.body);
  return !template.error && template.variables.length > 0;
}

async function toggleAlwaysOnTop(): Promise<void> {
  const next = !alwaysOnTop.value;
  windowError.value = "";
  try {
    const settings = await windowApi.setStickySettings({ alwaysOnTop: next });
    alwaysOnTop.value = settings.alwaysOnTop;
  } catch {
    windowError.value = "无法更新始终置顶设置";
  }
}

async function toggleDensity(): Promise<void> {
  if (densityBusy.value) return;
  const next: StickyDensity =
    density.value === "comfortable" ? "compact" : "comfortable";
  densityBusy.value = true;
  windowError.value = "";
  try {
    const settings = await windowApi.setStickySettings({ density: next });
    density.value = settings.density ?? next;
    settingsOpen.value = false;
  } catch {
    windowError.value = "无法调整便签尺寸";
  } finally {
    densityBusy.value = false;
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

onMounted(async () => {
  await load();
  if ("__TAURI_INTERNALS__" in window) {
    const settings = await windowApi.getStickySettings();
    alwaysOnTop.value = settings.alwaysOnTop;
    density.value = settings.density ?? "comfortable";
    stopListening = await listen("prompts-changed", () => void load());
  }
});
onBeforeUnmount(() => stopListening?.());
</script>

<template>
  <main class="sticky-window" :class="density">
    <header class="sticky-titlebar" data-tauri-drag-region="deep">
      <div class="sticky-traffic" aria-hidden="true"><i /><i /><i /></div>
      <strong class="sticky-brand">PromptDock</strong>
      <div class="sticky-window-actions">
        <button
          data-test="sticky-menu"
          title="便签设置"
          aria-label="便签设置"
          @click="settingsOpen = !settingsOpen"
        >
          ⋯
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

    <section class="sticky-heading">
      <div>
        <h1><span aria-hidden="true">⌖</span> 快捷便签</h1>
        <p v-if="density === 'comfortable'">
          随手复制好用的 Prompt，提升工作效率 ✨
        </p>
      </div>
      <span class="sticky-count">置顶 {{ prompts.length }} 条</span>
    </section>

    <section class="sticky-list" :aria-busy="loading">
      <template
        v-for="(prompt, index) in slots"
        :key="prompt?.id ?? `empty-${index}`"
      >
        <button
          v-if="prompt"
          data-test="sticky-slot"
          class="sticky-row"
          :class="{ copied: feedback?.id === prompt.id && !feedback.error }"
          :title="`点击复制「${prompt.title}」完整正文`"
          @click="activate(prompt)"
        >
          <span class="sticky-glyph" aria-hidden="true">{{
            promptHasVariables(prompt) ? "{}" : "⌁"
          }}</span>
          <span class="sticky-card-copy">
            <span class="sticky-row-title">
              {{ prompt.title }}
              <small
                v-if="density === 'comfortable' && promptHasVariables(prompt)"
                >含变量</small
              >
            </span>
            <span v-if="density === 'comfortable'" class="sticky-description">
              {{ prompt.description || prompt.body }}
            </span>
          </span>
          <span class="sticky-copy-action">
            <span aria-hidden="true">▣</span>
            <small v-if="density === 'comfortable'">
              {{
                feedback?.id === prompt.id
                  ? feedback.text
                  : promptActionLabel(prompt)
              }}
            </small>
          </span>
        </button>
        <div v-else data-test="sticky-slot" class="sticky-row empty">
          <span class="sticky-glyph" aria-hidden="true">＋</span>
          <span>空位 {{ index + 1 }} · 在完整窗口添加置顶</span>
        </div>
      </template>
    </section>

    <footer class="sticky-footer">
      <button
        data-test="manage-in-main"
        :disabled="switchingMode"
        @click="enterMainMode"
      >
        ⚙ 管理
      </button>
      <button
        data-test="sort-in-main"
        :disabled="switchingMode"
        @click="enterMainMode"
      >
        ⇅ 排序
      </button>
      <span class="sticky-footer-separator" />
      <label class="sticky-top-toggle">
        <button
          type="button"
          :class="{ on: alwaysOnTop }"
          :aria-pressed="alwaysOnTop"
          aria-label="切换始终置顶"
          @click="toggleAlwaysOnTop"
        />
        <span>始终置顶</span>
      </label>
    </footer>

    <div
      v-if="settingsOpen"
      class="sticky-settings-layer"
      @mousedown.self="settingsOpen = false"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticky-settings-title"
      >
        <header>
          <strong id="sticky-settings-title">便签设置</strong>
          <button aria-label="关闭便签设置" @click="settingsOpen = false">
            ×
          </button>
        </header>
        <p>舒适模式展示两行预览；紧凑模式保留 340 × 270 的五条标题。</p>
        <div class="sticky-setting-row">
          <span>
            <strong>窗口显示密度</strong>
            <small
              >当前：{{ density === "comfortable" ? "舒适" : "紧凑" }}</small
            >
          </span>
          <button
            data-test="sticky-density-toggle"
            :disabled="densityBusy"
            @click="toggleDensity"
          >
            {{
              densityBusy
                ? "调整中…"
                : density === "comfortable"
                  ? "切换紧凑模式"
                  : "切换舒适模式"
            }}
          </button>
        </div>
        <div class="sticky-setting-row">
          <span>
            <strong>管理 5 个位置</strong>
            <small>排序和移除均在完整窗口中完成</small>
          </span>
          <button @click="enterMainMode">打开完整窗口</button>
        </div>
      </section>
    </div>

    <div
      class="sticky-window-status"
      :class="{ error: windowError }"
      aria-live="polite"
    >
      {{ windowError || (feedback ? feedback.text : "") }}
    </div>
  </main>
</template>
