<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
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
let searchSequence = 0;
let stopSelectListener: (() => void) | null = null;

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

async function load(): Promise<void> {
  if (props.initialPrompts) return;
  const sequence = ++searchSequence;
  loading.value = true;
  try {
    const page = await promptApi.list({
      search: search.value || undefined,
      sort: "popular",
      limit: 12,
    });
    if (sequence === searchSequence) remoteResults.value = page.items;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    loading.value = false;
  }
}

watch(search, () => {
  activeIndex.value = 0;
  void load();
});

function move(delta: number): void {
  if (!results.value.length) return;
  activeIndex.value =
    (activeIndex.value + delta + results.value.length) % results.value.length;
}

async function activate(
  prompt = results.value[activeIndex.value],
): Promise<void> {
  if (!prompt) return;
  error.value = "";
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) {
    error.value = `${template.error.message}，请在主窗口编辑后重试`;
    return;
  }
  if (template.variables.length) {
    templatePrompt.value = prompt;
    return;
  }
  try {
    await copyPromptText({ id: prompt.id, text: prompt.body });
    emit("copied", prompt);
    if (!props.embedded) await windowApi.hideQuick();
    else emit("close");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "复制失败";
  }
}

function actionLabel(prompt: Prompt): string {
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) return "修正变量";
  return template.variables.length ? "填变量 ↵" : "复制 ↵";
}

async function templateCopied(): Promise<void> {
  const prompt = templatePrompt.value;
  if (prompt) emit("copied", prompt);
  if (!props.embedded) await windowApi.hideQuick();
  else emit("close");
}

function close(): void {
  if (templatePrompt.value) templatePrompt.value = null;
  else emit("close");
}

function onKeydown(event: KeyboardEvent): void {
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

onMounted(async () => {
  await load();
  await nextTick();
  input.value?.focus();
  if ("__TAURI_INTERNALS__" in window) {
    stopSelectListener = await listen<string>(
      "quick-select-prompt",
      async (event) => {
        templatePrompt.value = await promptApi.get(event.payload);
      },
    );
  }
});
onBeforeUnmount(() => stopSelectListener?.());
</script>

<template>
  <div class="quick-palette" @keydown="onKeydown">
    <TemplateVariablesPanel
      v-if="templatePrompt"
      :prompt="templatePrompt"
      @cancel="templatePrompt = null"
      @copied="templateCopied"
    />
    <template v-else>
      <header class="quick-search">
        <span aria-hidden="true">⌕</span>
        <input
          ref="input"
          v-model="search"
          aria-label="搜索提示词"
          placeholder="搜索并快速复制提示词…"
        />
        <kbd>ESC</kbd>
      </header>
      <div class="quick-results" role="listbox">
        <button
          v-for="(prompt, index) in results"
          :key="prompt.id"
          data-test="quick-result"
          class="quick-result"
          :class="{ active: index === activeIndex }"
          :aria-selected="index === activeIndex"
          @mouseenter="activeIndex = index"
          @click="activate(prompt)"
        >
          <span class="quick-icon">{{ prompt.isPinned ? "⌁" : "P" }}</span>
          <span class="quick-copy">
            <strong>{{ prompt.title }}</strong>
            <small
              >{{ prompt.categoryName }} ·
              {{ prompt.description || prompt.body }}</small
            >
          </span>
          <span class="quick-action">{{ actionLabel(prompt) }}</span>
        </button>
        <div v-if="loading" class="quick-empty">正在检索本机 SQLite…</div>
        <div v-else-if="!results.length" class="quick-empty">
          没有匹配的提示词
        </div>
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
