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

type FeedbackTone = "success" | "warning" | "error";

const prompts = ref<Prompt[]>([]);
const alwaysOnTop = ref(true);
const density = ref<StickyDensity>("comfortable");
const feedback = ref<{
  id: string;
  text: string;
  tone: FeedbackTone;
} | null>(null);
const loading = ref(true);
const switchingMode = ref(false);
const densityBusy = ref(false);
const alwaysOnTopBusy = ref(false);
const settingsLoading = ref(false);
const settingsOpen = ref(false);
const windowError = ref("");
const copyingId = ref<string | null>(null);
const routingId = ref<string | null>(null);
const hideBusy = ref(false);
let stopListening: (() => void) | null = null;
let feedbackTimer: number | null = null;
let copyRequest = 0;
let loadRequest = 0;
let settingsRequest = 0;
let settingsRevision = 0;
let routingRequest = 0;
let routingIdentity: string | null = null;
let alwaysOnTopRequest = 0;
let densityRequest = 0;
let mainModeRequest = 0;
let hideRequest = 0;
let disposed = false;
const slots = computed(() =>
  Array.from({ length: 5 }, (_, index) => prompts.value[index] ?? null),
);
const statusTone = computed<FeedbackTone | null>(() =>
  windowError.value ? "error" : (feedback.value?.tone ?? null),
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
  value: { id: string; text: string; tone: FeedbackTone },
): void {
  clearFeedbackTimer();
  feedback.value = value;
  feedbackTimer = window.setTimeout(() => {
    if (!disposed && request === copyRequest) feedback.value = null;
    feedbackTimer = null;
  }, 1600);
}

async function load(): Promise<void> {
  const request = ++loadRequest;
  loading.value = true;
  windowError.value = "";
  try {
    const nextPrompts = await promptApi.listSticky();
    if (disposed || request !== loadRequest) return;
    prompts.value = nextPrompts;
    if (
      routingId.value &&
      !nextPrompts.some((prompt) => identity(prompt) === routingIdentity)
    ) {
      routingRequest += 1;
      routingId.value = null;
      routingIdentity = null;
    }
  } catch {
    if (!disposed && request === loadRequest) {
      windowError.value = "无法加载便签提示词";
    }
  } finally {
    if (!disposed && request === loadRequest) loading.value = false;
  }
}

async function activate(prompt: Prompt): Promise<void> {
  if (copyingId.value || routingId.value) return;
  windowError.value = "";
  clearFeedbackTimer();
  feedback.value = null;
  const template = inspectTemplateVariables(prompt.body);
  if (!template.error && template.variables.length) {
    const request = ++routingRequest;
    const promptIdentity = identity(prompt);
    routingId.value = prompt.id;
    routingIdentity = promptIdentity;
    try {
      await windowApi.showQuick(prompt.id);
    } catch {
      if (
        !disposed &&
        request === routingRequest &&
        prompts.value.some(
          (candidate) => identity(candidate) === promptIdentity,
        )
      ) {
        windowError.value = "无法打开变量填写窗口";
      }
    } finally {
      if (!disposed && request === routingRequest) {
        routingId.value = null;
        routingIdentity = null;
      }
    }
    return;
  }
  const request = ++copyRequest;
  const promptIdentity = identity(prompt);
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
      tone: result.status === "copied-with-stats-error" ? "warning" : "success",
    });
  } catch (reason) {
    if (isCurrentCopy(request, promptIdentity)) {
      showFeedback(request, {
        id: prompt.id,
        text: reason instanceof Error ? reason.message : "复制失败",
        tone: "error",
      });
    }
  } finally {
    if (!disposed && request === copyRequest) copyingId.value = null;
  }
}

function promptActionLabel(prompt: Prompt): string {
  if (routingId.value === prompt.id) return "正在打开";
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
  if (settingsLoading.value || alwaysOnTopBusy.value) return;
  const request = ++alwaysOnTopRequest;
  settingsRevision += 1;
  alwaysOnTopBusy.value = true;
  windowError.value = "";
  try {
    const settings = await windowApi.setStickySettings({ alwaysOnTop: next });
    if (!disposed && request === alwaysOnTopRequest) {
      alwaysOnTop.value = settings.alwaysOnTop;
    }
  } catch {
    if (!disposed && request === alwaysOnTopRequest) {
      windowError.value = "无法更新始终置顶设置";
    }
  } finally {
    if (!disposed && request === alwaysOnTopRequest) {
      alwaysOnTopBusy.value = false;
    }
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
  if (settingsLoading.value || densityBusy.value) return;
  const next: StickyDensity =
    density.value === "comfortable" ? "compact" : "comfortable";
  const request = ++densityRequest;
  settingsRevision += 1;
  densityBusy.value = true;
  windowError.value = "";
  try {
    const settings = await windowApi.setStickySettings({ density: next });
    if (!disposed && request === densityRequest) {
      density.value = settings.density ?? next;
      settingsOpen.value = false;
    }
  } catch {
    if (!disposed && request === densityRequest) {
      windowError.value = "无法调整便签尺寸";
    }
  } finally {
    if (!disposed && request === densityRequest) densityBusy.value = false;
  }
}

async function enterMainMode(): Promise<void> {
  if (switchingMode.value) return;
  const request = ++mainModeRequest;
  switchingMode.value = true;
  windowError.value = "";
  try {
    await windowApi.enterMainMode();
  } catch {
    if (!disposed && request === mainModeRequest) {
      windowError.value = "无法切换到完整模式";
    }
  } finally {
    if (!disposed && request === mainModeRequest) switchingMode.value = false;
  }
}

async function hideSticky(): Promise<void> {
  if (hideBusy.value) return;
  const request = ++hideRequest;
  hideBusy.value = true;
  windowError.value = "";
  try {
    await windowApi.hideSticky();
  } catch {
    if (!disposed && request === hideRequest) {
      windowError.value = "无法收起便签";
    }
  } finally {
    if (!disposed && request === hideRequest) hideBusy.value = false;
  }
}

async function initializeSettings(): Promise<void> {
  const request = ++settingsRequest;
  const revision = settingsRevision;
  settingsLoading.value = true;
  try {
    const settings = await windowApi.getStickySettings();
    if (
      !disposed &&
      request === settingsRequest &&
      revision === settingsRevision
    ) {
      alwaysOnTop.value = settings.alwaysOnTop;
      density.value = settings.density ?? "comfortable";
    }
  } catch {
    if (!disposed && request === settingsRequest) {
      windowError.value = "无法读取便签设置";
    }
  } finally {
    if (!disposed && request === settingsRequest) settingsLoading.value = false;
  }
}

async function startPromptsListener(): Promise<void> {
  try {
    const unlisten = await listen("prompts-changed", () => void load());
    if (disposed) unlisten();
    else stopListening = unlisten;
  } catch {
    if (!disposed) windowError.value = "无法监听便签更新";
  }
}

onMounted(() => {
  if ("__TAURI_INTERNALS__" in window) {
    void startPromptsListener();
    void initializeSettings();
  }
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  copyRequest += 1;
  loadRequest += 1;
  settingsRequest += 1;
  settingsRevision += 1;
  routingRequest += 1;
  alwaysOnTopRequest += 1;
  densityRequest += 1;
  mainModeRequest += 1;
  hideRequest += 1;
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
        <PdIconButton
          label="收起便签"
          :icon="Minus"
          :disabled="hideBusy"
          @click="hideSticky"
        />
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
          :class="{
            copied: feedback?.id === prompt.id && feedback.tone !== 'error',
            warning: feedback?.id === prompt.id && feedback.tone === 'warning',
          }"
          :aria-label="promptAccessibleLabel(prompt)"
          :disabled="copyingId !== null || routingId !== null"
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
              v-if="feedback?.id === prompt.id && feedback.tone !== 'error'"
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
          :disabled="switchingMode || copyingId !== null || routingId !== null"
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
          :disabled="settingsLoading || alwaysOnTopBusy"
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
          :disabled="settingsLoading"
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
      :class="{
        error: statusTone === 'error',
        warning: statusTone === 'warning',
      }"
      :role="statusTone === 'error' ? 'alert' : 'status'"
      :aria-live="statusTone === 'error' ? 'assertive' : 'polite'"
    >
      {{ windowError || (feedback ? feedback.text : "") }}
    </div>
  </main>
</template>
