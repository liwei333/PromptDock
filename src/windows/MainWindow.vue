<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  CircleAlert,
  CircleCheck,
  DatabaseBackup,
  Pin,
  Upload,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { backupApi, categoryApi, windowApi } from "@/api/commands";
import CategoryManagerDialog from "@/components/CategoryManagerDialog.vue";
import DashboardStatCards from "@/components/DashboardStatCards.vue";
import ImportPreviewDialog from "@/components/ImportPreviewDialog.vue";
import PromptDetailPane from "@/components/PromptDetailPane.vue";
import PromptEditorDialog from "@/components/PromptEditorDialog.vue";
import PromptListPane from "@/components/PromptListPane.vue";
import QuickPalette from "@/components/QuickPalette.vue";
import RuntimeInfoDialog from "@/components/RuntimeInfoDialog.vue";
import StickyManagerDialog from "@/components/StickyManagerDialog.vue";
import WorkbenchFilters from "@/components/WorkbenchFilters.vue";
import WorkbenchIconRail from "@/components/WorkbenchIconRail.vue";
import PdButton from "@/components/ui/PdButton.vue";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import { usePromptStore } from "@/stores/promptStore";
import type { ImportMode, ImportPreview } from "@/types/backup";
import type { Prompt, PromptInput, PromptQuery } from "@/types/prompt";

const store = usePromptStore();
const selectedId = ref<string | null>(null);
const selected = computed(
  () => store.prompts.find((prompt) => prompt.id === selectedId.value) ?? null,
);
const editing = ref<Prompt | null | undefined>(undefined);
const variableMode = ref(false);
const quickOpen = ref(false);
const stickyManagerOpen = ref(false);
const runtimeOpen = ref(false);
const categoryManagerOpen = ref(false);
const categoryBusy = ref(false);
const categoryError = ref("");
const importPreview = ref<ImportPreview | null>(null);
const importing = ref(false);
const importError = ref("");
const saving = ref(false);
const saveError = ref("");
const switchingMode = ref(false);
const copyingId = ref<string | null>(null);
const copiedId = ref<string | null>(null);
const toast = ref<{ text: string; kind: "success" | "error" } | null>(null);
let stopListening: (() => void) | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let copySuccessTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.prompts.map((prompt) => prompt.id).join("|"),
  () => {
    if (!store.prompts.length) {
      selectedId.value = null;
      variableMode.value = false;
      return;
    }
    if (!store.prompts.some((prompt) => prompt.id === selectedId.value)) {
      selectedId.value = store.prompts[0].id;
      variableMode.value = false;
    }
  },
);

function notify(text: string, kind: "success" | "error" = "success"): void {
  toast.value = { text, kind };
  window.setTimeout(() => {
    if (toast.value?.text === text) toast.value = null;
  }, 2600);
}

function selectPrompt(prompt: Prompt): void {
  selectedId.value = prompt.id;
  variableMode.value = false;
}

function markCopied(promptId: string): void {
  if (copySuccessTimer) window.clearTimeout(copySuccessTimer);
  copiedId.value = promptId;
  copySuccessTimer = window.setTimeout(() => {
    if (copiedId.value === promptId) copiedId.value = null;
    copySuccessTimer = null;
  }, 1200);
}

function applyFilters(patch: PromptQuery): void {
  void store.load({ view: "all", tab: "all", ...patch });
}

function updateSearch(value: string): void {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(
    () => void store.load({ search: value || undefined }),
    150,
  );
}

async function showFavorites(): Promise<void> {
  await store.load({
    view: "all",
    tab: "all",
    search: undefined,
    categoryId: undefined,
    tag: undefined,
    favoriteOnly: true,
    pinnedOnly: false,
    recentOnly: false,
    templateOnly: false,
  });
}

async function copy(prompt: Prompt): Promise<void> {
  const template = inspectTemplateVariables(prompt.body);
  if (!template.error && template.variables.length) {
    selectedId.value = prompt.id;
    variableMode.value = true;
    return;
  }
  copyingId.value = prompt.id;
  try {
    const result = await copyPromptText({ id: prompt.id, text: prompt.body });
    if (copyingId.value === prompt.id) {
      copyingId.value = null;
      markCopied(prompt.id);
    }
    notify(
      result.status === "copied"
        ? "完整正文已复制"
        : "已复制，但使用次数暂未更新",
      result.status === "copied" ? "success" : "error",
    );
    await store.load();
  } catch (reason) {
    notify(
      reason instanceof Error ? reason.message : "剪贴板写入失败",
      "error",
    );
  } finally {
    if (copyingId.value === prompt.id) copyingId.value = null;
  }
}

async function toggleFavorite(prompt: Prompt): Promise<void> {
  try {
    await store.favorite(prompt);
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "收藏更新失败", "error");
  }
}

async function togglePin(prompt: Prompt): Promise<void> {
  try {
    await store.pin(prompt);
    notify(prompt.isPinned ? "已从便签移除" : "已加入快捷便签");
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : String(reason), "error");
  }
}

async function savePrompt(input: PromptInput, id?: string): Promise<void> {
  saving.value = true;
  saveError.value = "";
  try {
    const saved = await store.save(input, id);
    editing.value = undefined;
    selectedId.value = saved.id;
    notify(id ? "修改已保存" : "提示词已保存到本机");
  } catch (reason) {
    saveError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    saving.value = false;
  }
}

async function removePrompt(prompt: Prompt): Promise<void> {
  if (
    !(await confirm(`确定删除「${prompt.title}」吗？此操作不可撤销。`, {
      title: "删除提示词？",
      kind: "warning",
    }))
  )
    return;
  try {
    await store.remove(prompt.id);
    editing.value = undefined;
    selectedId.value = null;
    notify("提示词已删除");
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "删除失败", "error");
  }
}

async function createCategory(name: string): Promise<void> {
  categoryBusy.value = true;
  categoryError.value = "";
  try {
    await categoryApi.create(name);
    await store.load();
    notify("分类已创建");
  } catch (reason) {
    categoryError.value =
      reason instanceof Error ? reason.message : String(reason);
  } finally {
    categoryBusy.value = false;
  }
}

async function renameCategory(id: string, name: string): Promise<void> {
  categoryBusy.value = true;
  categoryError.value = "";
  try {
    await categoryApi.rename(id, name);
    await store.load();
    notify("分类已重命名");
  } catch (reason) {
    categoryError.value =
      reason instanceof Error ? reason.message : String(reason);
  } finally {
    categoryBusy.value = false;
  }
}

async function deleteCategory(
  sourceId: string,
  targetId: string,
): Promise<void> {
  categoryBusy.value = true;
  categoryError.value = "";
  try {
    await categoryApi.delete(sourceId, targetId);
    await store.load(
      store.query.categoryId === sourceId
        ? { categoryId: undefined, search: undefined }
        : undefined,
    );
    notify("分类已删除，提示词已安全迁移");
  } catch (reason) {
    categoryError.value =
      reason instanceof Error ? reason.message : "删除分类失败";
  } finally {
    categoryBusy.value = false;
  }
}

async function exportBackup(): Promise<void> {
  try {
    const result = await backupApi.exportWithDialog();
    if (!result.cancelled) notify(`已导出 ${result.promptCount} 条提示词`);
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "导出失败", "error");
  }
}

async function enterStickyMode(): Promise<void> {
  if (switchingMode.value) return;
  switchingMode.value = true;
  try {
    await windowApi.enterStickyMode();
  } catch {
    notify("无法切换到便签模式", "error");
  } finally {
    switchingMode.value = false;
  }
}

async function previewImport(): Promise<void> {
  try {
    importPreview.value = await backupApi.previewWithDialog();
  } catch (reason) {
    notify(
      reason instanceof Error ? reason.message : "备份文件校验失败",
      "error",
    );
  }
}

async function cancelImport(): Promise<void> {
  const token = importPreview.value?.token;
  importPreview.value = null;
  importError.value = "";
  if (token) await backupApi.cancel(token).catch(() => undefined);
}

async function commitImport(mode: ImportMode): Promise<void> {
  if (!importPreview.value) return;
  if (
    mode === "replace" &&
    !(await confirm(
      "替换会清空当前分类和提示词。应用会先创建安全备份，确定继续吗？",
      { title: "确认替换现有库？", kind: "warning" },
    ))
  )
    return;
  importing.value = true;
  importError.value = "";
  try {
    const result = await backupApi.commit(importPreview.value.token, mode);
    importPreview.value = null;
    await store.load();
    notify(
      `导入完成：新增 ${result.imported}，跳过 ${result.skipped}，副本 ${result.duplicated}`,
    );
  } catch (reason) {
    importError.value =
      reason instanceof Error ? reason.message : String(reason);
  } finally {
    importing.value = false;
  }
}

function keydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const editingText = target?.matches(
    "input, textarea, select, [contenteditable='true']",
  );
  const commandModifier = event.metaKey || event.ctrlKey;
  if (commandModifier && event.key.toLowerCase() === "k") {
    event.preventDefault();
    quickOpen.value = true;
  } else if (
    commandModifier &&
    event.key.toLowerCase() === "f" &&
    !editingText
  ) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#main-search")?.focus();
  } else if (
    commandModifier &&
    event.key.toLowerCase() === "n" &&
    !editingText
  ) {
    event.preventDefault();
    editing.value = null;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", keydown);
  await store.load();
  if ("__TAURI_INTERNALS__" in window) {
    stopListening = await listen("prompts-changed", () => void store.load());
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", keydown);
  stopListening?.();
  if (searchTimer) window.clearTimeout(searchTimer);
  if (copySuccessTimer) window.clearTimeout(copySuccessTimer);
});
</script>

<template>
  <div class="v3-app-shell">
    <WorkbenchIconRail
      :favorite-active="Boolean(store.query.favoriteOnly)"
      :switching-sticky="switchingMode"
      @home="store.resetFilters()"
      @favorites="showFavorites"
      @categories="categoryManagerOpen = true"
      @sticky="enterStickyMode"
      @settings="runtimeOpen = true"
    />

    <main class="v3-main-area">
      <WorkbenchFilters
        :query="store.query"
        :categories="store.categories"
        :tags="store.tags"
        @change="applyFilters"
        @search="updateSearch"
        @clear="store.resetFilters()"
        @manage-categories="categoryManagerOpen = true"
      />
      <DashboardStatCards :stats="store.stats" />

      <section class="v3-workbench">
        <PromptListPane
          :prompts="store.prompts"
          :selected-id="selectedId"
          :total="store.total"
          :loading="store.loading"
          :error="store.error"
          :copying-id="copyingId"
          :copied-id="copiedId"
          @select="selectPrompt"
          @copy="copy"
          @favorite="toggleFavorite"
          @pin="togglePin"
          @manage-categories="categoryManagerOpen = true"
          @new="editing = null"
          @retry="store.load()"
        />
        <PromptDetailPane
          :prompt="selected"
          :variable-mode="variableMode"
          @copy="copy"
          @edit="editing = $event"
          @new="editing = null"
          @export="exportBackup"
          @cancel-variables="variableMode = false"
          @copied="
            notify('替换后的全文已复制');
            variableMode = false;
            store.load();
          "
        />
      </section>
      <footer class="v3-statusbar">
        <span>本机 SQLite · 离线可用 · 不上传云端</span>
        <div class="v3-status-actions">
          <PdButton
            variant="ghost"
            size="sm"
            data-test="manage-sticky"
            @click="stickyManagerOpen = true"
          >
            <template #leading><Pin aria-hidden="true" /></template>
            管理置顶
          </PdButton>
          <PdButton
            variant="ghost"
            size="sm"
            data-test="status-import"
            @click="previewImport"
          >
            <template #leading><Upload aria-hidden="true" /></template>
            导入
          </PdButton>
          <PdButton
            variant="ghost"
            size="sm"
            data-test="status-export"
            @click="exportBackup"
          >
            <template #leading><DatabaseBackup aria-hidden="true" /></template>
            JSON 备份
          </PdButton>
        </div>
      </footer>
    </main>

    <PromptEditorDialog
      v-if="editing !== undefined"
      :prompt="editing"
      :categories="store.categories"
      :saving="saving"
      :server-error="saveError"
      @save="savePrompt"
      @close="
        editing = undefined;
        saveError = '';
      "
      @delete="removePrompt"
    />
    <div
      v-if="quickOpen"
      class="palette-overlay"
      @mousedown.self="quickOpen = false"
    >
      <QuickPalette
        :initial-prompts="store.prompts"
        embedded
        @close="quickOpen = false"
        @copied="
          notify('完整正文已复制');
          store.load();
        "
      />
    </div>
    <StickyManagerDialog
      v-if="stickyManagerOpen"
      :prompts="store.pinned"
      @close="stickyManagerOpen = false"
      @changed="store.load()"
    />
    <ImportPreviewDialog
      v-if="importPreview"
      :preview="importPreview"
      :busy="importing"
      :error="importError"
      @cancel="cancelImport"
      @commit="commitImport"
    />
    <RuntimeInfoDialog v-if="runtimeOpen" @close="runtimeOpen = false" />
    <CategoryManagerDialog
      v-if="categoryManagerOpen"
      :categories="store.categories"
      :busy="categoryBusy"
      :error="categoryError"
      @close="
        categoryManagerOpen = false;
        categoryError = '';
      "
      @create="createCategory"
      @rename="renameCategory"
      @delete="deleteCategory"
    />
    <div
      data-test="main-live-region"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ toast?.text ?? "" }}
    </div>
    <div v-if="toast" class="toast" :class="toast.kind">
      <CircleCheck v-if="toast.kind === 'success'" aria-hidden="true" />
      <CircleAlert v-else aria-hidden="true" />
      <span>{{ toast.text }}</span>
    </div>
  </div>
</template>
