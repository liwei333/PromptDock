<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import {
  Check,
  Copy,
  GripVertical,
  Minus,
  PanelTopOpen,
  Plus,
  Settings,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { promptApi, windowApi } from "@/api/commands";
import PdButton from "@/components/ui/PdButton.vue";
import PdDialog from "@/components/ui/PdDialog.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdSwitch from "@/components/ui/PdSwitch.vue";
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
const alwaysOnTopBusy = ref(false);
const settingsOpen = ref(false);
const windowError = ref("");
const copyingId = ref<string | null>(null);
let stopListening: (() => void) | null = null;
let feedbackTimer: number | null = null;
let copyRequest = 0;
let disposed = false;
const slots = computed(() =>
  Array.from({ length: 5 }, (_, index) => prompts.value[index] ?? null),
);
const statusIsError = computed(
  () => Boolean(windowError.value) || Boolean(feedback.value?.error),
);

function identity(prompt: Prompt): string {
  return `${prompt.id}\u0000${prompt.body}\u0000${prompt.updatedAt}`;
}

function isCurrentCopy(request: number, promptIdentity: string): boolean {
  return (
    !disposed &&
    request === copyRequest &&
    prompts.value.some((prompt) => identity(prompt) === promptIdentity)
  );
}

function clearFeedbackTimer(): void {
  if (feedbackTimer !== null) {
    window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
}

function showFeedback(
  request: number,
  value: { id: string; text: string; error: boolean },
): void {
  clearFeedbackTimer();
  feedback.value = value;
  feedbackTimer = window.setTimeout(() => {
    if (!disposed && request === copyRequest) feedback.value = null;
    feedbackTimer = null;
  }, 1600);
}

async function load(): Promise<void> {
  try {
    prompts.value = await promptApi.listSticky();
  } finally {
    loading.value = false;
  }
}

async function activate(prompt: Prompt): Promise<void> {
  if (copyingId.value) return;
  const template = inspectTemplateVariables(prompt.body);
  if (!template.error && template.variables.length) {
    await windowApi.showQuick(prompt.id);
    return;
  }
  const request = ++copyRequest;
  const promptIdentity = identity(prompt);
  clearFeedbackTimer();
  feedback.value = null;
  copyingId.value = prompt.id;
  try {
    const result = await copyPromptText({ id: prompt.id, text: prompt.body });
    if (!isCurrentCopy(request, promptIdentity)) return;
    showFeedback(request, {
      id: prompt.id,
      text:
        result.status === "copied-with-stats-error"
          ? "已复制，统计更新失败"
          : "已复制",
      error: false,
    });
  } catch (reason) {
    if (isCurrentCopy(request, promptIdentity)) {
      showFeedback(request, {
        id: prompt.id,
        text: reason instanceof Error ? reason.message : "复制失败",
        error: true,
      });
    }
  } finally {
    if (!disposed && request === copyRequest) copyingId.value = null;
  }
}

function promptActionLabel(prompt: Prompt): string {
  if (copyingId.value === prompt.id) return "正在复制";
  if (feedback.value?.id === prompt.id) return feedback.value.text;
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) return "复制";
  return template.variables.length ? "填写变量" : "复制";
}

function promptHasVariables(prompt: Prompt): boolean {
  const template = inspectTemplateVariables(prompt.body);
  return !template.error && template.variables.length > 0;
}

function promptAccessibleLabel(prompt: Prompt): string {
  return `${promptActionLabel(prompt)}「${prompt.title}」`;
}

async function toggleAlwaysOnTop(next: boolean): Promise<void> {
  if (alwaysOnTopBusy.value) return;
  alwaysOnTopBusy.value = true;
  windowError.value = "";
  try {
    const settings = await windowApi.setStickySettings({ alwaysOnTop: next });
    alwaysOnTop.value = settings.alwaysOnTop;
  } catch {
    windowError.value = "无法更新始终置顶设置";
  } finally {
    alwaysOnTopBusy.value = false;
  }
}

function dismissSettings(): void {
  if (!densityBusy.value) settingsOpen.value = false;
}

function guardSettingsDismiss(event: Event): void {
  if (!densityBusy.value) return;
  const isEscape = event instanceof KeyboardEvent && event.key === "Escape";
  const isCloseClick =
    event instanceof MouseEvent &&
    event.target instanceof Element &&
    event.target.closest("button[aria-label='关闭便签设置']") !== null;
  if (!isEscape && !isCloseClick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
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
onBeforeUnmount(() => {
  disposed = true;
  copyRequest += 1;
  clearFeedbackTimer();
  stopListening?.();
});
</script>

<template>
  <main class="sticky-window" :class="density">
    <header class="sticky-titlebar" data-tauri-drag-region="deep">
      <strong class="sticky-brand">PromptDock</strong>
      <div class="sticky-window-actions">
        <PdIconButton
          data-test="sticky-menu"
          label="便签设置"
          :icon="Settings"
          @click="settingsOpen = true"
        />
        <PdIconButton
          data-test="enter-main-mode"
          label="切换到完整模式"
          :icon="PanelTopOpen"
          :disabled="switchingMode"
          @click="enterMainMode"
        />
        <PdIconButton label="收起便签" :icon="Minus" @click="hideSticky" />
      </div>
    </header>

    <section class="sticky-heading">
      <div>
        <h1>快捷便签</h1>
        <p v-if="density === 'comfortable'">
          随手复制常用 Prompt，保持工作流连贯。
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
          :aria-label="promptAccessibleLabel(prompt)"
          :disabled="copyingId !== null"
          @click="activate(prompt)"
        >
          <span class="sticky-glyph" aria-hidden="true">
            <GripVertical />
          </span>
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
            <Check
              v-if="feedback?.id === prompt.id && !feedback.error"
              aria-hidden="true"
            />
            <Copy v-else aria-hidden="true" />
            <small v-if="density === 'comfortable'">
              {{ promptActionLabel(prompt) }}
            </small>
          </span>
        </button>
        <button
          v-else
          data-test="sticky-slot"
          class="sticky-row empty"
          :aria-label="`空位 ${index + 1}，打开完整窗口添加置顶`"
          :disabled="switchingMode"
          @click="enterMainMode"
        >
          <span class="sticky-glyph" aria-hidden="true"><Plus /></span>
          <span>空位 {{ index + 1 }} · 在完整窗口添加置顶</span>
        </button>
      </template>
    </section>

    <footer class="sticky-footer">
      <PdButton
        data-test="manage-in-main"
        size="sm"
        variant="ghost"
        :disabled="switchingMode"
        @click="enterMainMode"
      >
        <template #leading><Settings aria-hidden="true" /></template>
        管理
      </PdButton>
      <PdButton
        data-test="sort-in-main"
        size="sm"
        variant="ghost"
        :disabled="switchingMode"
        @click="enterMainMode"
      >
        <template #leading><GripVertical aria-hidden="true" /></template>
        排序
      </PdButton>
      <div class="sticky-top-toggle">
        <PdSwitch
          :model-value="alwaysOnTop"
          :disabled="alwaysOnTopBusy"
          label="切换始终置顶"
          @update:model-value="toggleAlwaysOnTop"
        />
        <span>始终置顶</span>
      </div>
    </footer>

    <PdDialog
      class="sticky-settings-dialog"
      :class="`sticky-settings-dialog--${density}`"
      :open="settingsOpen"
      title="便签设置"
      description="舒适模式展示两行预览；紧凑模式保留 340 × 270 的五条标题。"
      close-label="关闭便签设置"
      :close-on-outside="!densityBusy"
      @click.capture="guardSettingsDismiss"
      @keydown.capture="guardSettingsDismiss"
      @dismiss="dismissSettings"
    >
      <div class="sticky-setting-row">
        <span>
          <strong>窗口显示密度</strong>
          <small>当前：{{ density === "comfortable" ? "舒适" : "紧凑" }}</small>
        </span>
        <PdButton
          data-test="sticky-density-toggle"
          size="sm"
          :loading="densityBusy"
          @click="toggleDensity"
        >
          {{
            densityBusy
              ? "调整中…"
              : density === "comfortable"
                ? "切换紧凑模式"
                : "切换舒适模式"
          }}
        </PdButton>
      </div>
      <div class="sticky-setting-row">
        <span>
          <strong>管理 5 个位置</strong>
          <small>排序和移除均在完整窗口中完成</small>
        </span>
        <PdButton
          size="sm"
          :disabled="switchingMode || densityBusy"
          @click="enterMainMode"
        >
          打开完整窗口
        </PdButton>
      </div>
    </PdDialog>

    <div
      class="sticky-window-status"
      :class="{ error: statusIsError }"
      :role="statusIsError ? 'alert' : 'status'"
      :aria-live="statusIsError ? 'assertive' : 'polite'"
    >
      {{ windowError || (feedback ? feedback.text : "") }}
    </div>
  </main>
</template>
