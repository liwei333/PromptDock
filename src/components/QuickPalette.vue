<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { Braces, Check, Copy, Search } from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";

import { promptApi, windowApi } from "@/api/commands";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import type { Prompt } from "@/types/prompt";
import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";

const props = withDefaults(
  defineProps<{ initialPrompts?: Prompt[]; embedded?: boolean }>(),
  { initialPrompts: undefined, embedded: false },
);
const emit = defineEmits<{ close: []; copied: [prompt: Prompt] }>();
const input = ref<HTMLInputElement | null>(null);
const search = ref("");
const remoteResults = ref<Prompt[]>([]);
const activeIndex = ref(0);
const loading = ref(false);
const error = ref("");
const templatePrompt = ref<Prompt | null>(null);
const copyingId = ref<string | null>(null);
const copiedId = ref<string | null>(null);
const listboxId = useId();
let searchSequence = 0;
let activationSequence = 0;
let selectRequest = 0;
let stopSelectListener: (() => void) | null = null;
let copySuccessTimer: number | null = null;
let disposed = false;

function matches(prompt: Prompt, keyword: string): boolean {
  if (!keyword) return true;
  const haystack = [
    prompt.title,
    prompt.description,
    prompt.body,
    prompt.categoryName,
    ...prompt.tags,
  ]
    .join("\n")
    .toLocaleLowerCase();
  return haystack.includes(keyword.toLocaleLowerCase());
}

const results = computed(() => {
  const source = props.initialPrompts ?? remoteResults.value;
  return source
    .filter((prompt) => matches(prompt, search.value.trim()))
    .slice(0, 12);
});
const activeOptionId = computed(() =>
  results.value[activeIndex.value]
    ? `${listboxId}-option-${activeIndex.value}`
    : undefined,
);

async function load(): Promise<void> {
  if (props.initialPrompts) return;
  const sequence = ++searchSequence;
  loading.value = true;
  error.value = "";
  try {
    const page = await promptApi.list({
      search: search.value || undefined,
      sort: "popular",
      limit: 12,
    });
    if (!disposed && sequence === searchSequence) {
      remoteResults.value = page.items;
    }
  } catch (reason) {
    if (!disposed && sequence === searchSequence) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  } finally {
    if (!disposed && sequence === searchSequence) loading.value = false;
  }
}

function invalidateNativeSelection(): void {
  selectRequest += 1;
  error.value = "";
}

watch(search, () => {
  invalidateNativeSelection();
  activeIndex.value = 0;
  void load();
});

watch(
  () => results.value.map((prompt) => prompt.id),
  (ids, previousIds) => {
    if (!ids.length) {
      activeIndex.value = 0;
      return;
    }
    const previousId = previousIds?.[activeIndex.value];
    const retainedIndex = previousId ? ids.indexOf(previousId) : -1;
    activeIndex.value =
      retainedIndex >= 0
        ? retainedIndex
        : Math.min(activeIndex.value, ids.length - 1);
  },
  { flush: "sync" },
);

function clearCopySuccess(): void {
  if (copySuccessTimer !== null) {
    window.clearTimeout(copySuccessTimer);
    copySuccessTimer = null;
  }
  copiedId.value = null;
}

function invalidateActivation(): void {
  activationSequence += 1;
  copyingId.value = null;
  clearCopySuccess();
}

function showCopySuccess(prompt: Prompt, sequence: number): void {
  clearCopySuccess();
  copiedId.value = prompt.id;
  copySuccessTimer = window.setTimeout(() => {
    if (
      !disposed &&
      sequence === activationSequence &&
      copiedId.value === prompt.id
    ) {
      copiedId.value = null;
    }
    copySuccessTimer = null;
  }, 1200);
}

function move(delta: number): void {
  if (!results.value.length) return;
  invalidateNativeSelection();
  activeIndex.value =
    (activeIndex.value + delta + results.value.length) % results.value.length;
}

function setActiveIndex(index: number): void {
  invalidateNativeSelection();
  activeIndex.value = index;
}

function preserveTemplateEditingIntent(): void {
  if (templatePrompt.value) invalidateNativeSelection();
}

async function activate(
  prompt = results.value[activeIndex.value],
): Promise<void> {
  if (!prompt) return;
  invalidateNativeSelection();
  if (copyingId.value) return;
  clearCopySuccess();
  const sequence = ++activationSequence;
  const template = inspectTemplateVariables(prompt.body);
  if (!template.error && template.variables.length) {
    templatePrompt.value = prompt;
    return;
  }
  copyingId.value = prompt.id;
  try {
    await copyPromptText({ id: prompt.id, text: prompt.body });
  } catch (reason) {
    if (!disposed && sequence === activationSequence) {
      error.value =
        reason instanceof Error ? reason.message : String(reason || "复制失败");
    }
    if (!disposed && sequence === activationSequence) copyingId.value = null;
    return;
  }
  if (disposed || sequence !== activationSequence) return;
  copyingId.value = null;
  showCopySuccess(prompt, sequence);
  emit("copied", prompt);
  if (props.embedded) {
    emit("close");
    return;
  }
  try {
    await windowApi.hideQuick();
  } catch {
    if (!disposed && sequence === activationSequence) {
      error.value = "已复制，但无法收起快速窗口";
    }
  }
}

function actionLabel(prompt: Prompt): string {
  if (copyingId.value === prompt.id) return "正在复制";
  if (copiedId.value === prompt.id) return "已复制";
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) return "复制原文";
  return template.variables.length ? "填写变量" : "复制";
}

function actionIcon(prompt: Prompt) {
  if (copiedId.value === prompt.id) return Check;
  const template = inspectTemplateVariables(prompt.body);
  return !template.error && template.variables.length ? Braces : Copy;
}

async function templateCopied(): Promise<void> {
  const prompt = templatePrompt.value;
  if (!prompt) return;
  invalidateNativeSelection();
  clearCopySuccess();
  const sequence = ++activationSequence;
  templatePrompt.value = null;
  showCopySuccess(prompt, sequence);
  emit("copied", prompt);
  if (props.embedded) {
    emit("close");
    return;
  }
  try {
    await windowApi.hideQuick();
  } catch {
    if (!disposed && sequence === activationSequence) {
      error.value = "已复制，但无法收起快速窗口";
    }
  }
}

function cancelTemplate(): void {
  invalidateNativeSelection();
  templatePrompt.value = null;
}

function close(): void {
  invalidateNativeSelection();
  invalidateActivation();
  if (templatePrompt.value) templatePrompt.value = null;
  else emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (templatePrompt.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    void activate();
  } else if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

async function startSelectListener(): Promise<void> {
  try {
    const unlisten = await listen<string>(
      "quick-select-prompt",
      async (event) => {
        if (disposed) return;
        invalidateActivation();
        error.value = "";
        const request = ++selectRequest;
        try {
          const prompt = await promptApi.get(event.payload);
          if (!disposed && request === selectRequest) {
            templatePrompt.value = prompt;
          }
        } catch (reason) {
          if (!disposed && request === selectRequest) {
            templatePrompt.value = null;
            error.value =
              reason instanceof Error ? reason.message : String(reason);
          }
        }
      },
    );
    if (disposed) unlisten();
    else stopSelectListener = unlisten;
  } catch (reason) {
    if (!disposed) {
      error.value =
        reason instanceof Error ? reason.message : "无法监听快速选择";
    }
  }
}

onMounted(() => {
  if ("__TAURI_INTERNALS__" in window) void startSelectListener();
  void load();
  void nextTick(() => input.value?.focus());
});
onBeforeUnmount(() => {
  disposed = true;
  searchSequence += 1;
  selectRequest += 1;
  invalidateActivation();
  stopSelectListener?.();
});
</script>

<template>
  <div
    class="quick-palette"
    @keydown="onKeydown"
    @input.capture="preserveTemplateEditingIntent"
    @change.capture="preserveTemplateEditingIntent"
  >
    <TemplateVariablesPanel
      v-if="templatePrompt"
      :prompt="templatePrompt"
      @cancel="cancelTemplate"
      @copied="templateCopied"
    />
    <template v-else>
      <header class="quick-search">
        <Search class="quick-search-icon" aria-hidden="true" />
        <input
          ref="input"
          v-model="search"
          role="combobox"
          aria-label="搜索提示词"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listboxId"
          :aria-activedescendant="activeOptionId"
          placeholder="搜索并快速复制提示词…"
        />
        <kbd>ESC</kbd>
      </header>
      <div
        :id="listboxId"
        class="quick-results"
        role="listbox"
        :aria-busy="loading"
      >
        <div
          v-for="(prompt, index) in results"
          :key="prompt.id"
          :id="`${listboxId}-option-${index}`"
          data-test="quick-result"
          class="quick-result"
          :class="{ active: index === activeIndex }"
          role="option"
          tabindex="-1"
          :aria-selected="index === activeIndex"
          :aria-label="`${prompt.title}，${actionLabel(prompt)}`"
          @mouseenter="setActiveIndex(index)"
          @mousedown.prevent
          @click="activate(prompt)"
        >
          <span class="quick-icon" aria-hidden="true">
            <component :is="actionIcon(prompt)" />
          </span>
          <span class="quick-copy">
            <strong>{{ prompt.title }}</strong>
            <small
              >{{ prompt.categoryName }} ·
              {{ prompt.description || prompt.body }}</small
            >
          </span>
          <span class="quick-action">
            <component :is="actionIcon(prompt)" aria-hidden="true" />
            {{ actionLabel(prompt) }}
          </span>
        </div>
      </div>
      <div v-if="loading" class="quick-empty" role="status" aria-live="polite">
        正在检索本机 SQLite…
      </div>
      <div
        v-else-if="!results.length"
        class="quick-empty"
        role="status"
        aria-live="polite"
      >
        没有匹配的提示词
      </div>
      <p v-if="error" class="quick-error" role="alert">{{ error }}</p>
      <footer class="quick-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>↵</kbd> 复制或填写变量</span>
        <span>仅写入剪贴板，不会自动粘贴</span>
      </footer>
    </template>
  </div>
</template>
