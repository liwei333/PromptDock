<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import { onBeforeUnmount, onMounted, ref } from "vue";

import { backupApi, categoryApi, windowApi } from "@/api/commands";
import CategoryCreateDialog from "@/components/CategoryCreateDialog.vue";
import ImportPreviewDialog from "@/components/ImportPreviewDialog.vue";
import PromptCard from "@/components/PromptCard.vue";
import PromptDetailDrawer from "@/components/PromptDetailDrawer.vue";
import PromptEditorDialog from "@/components/PromptEditorDialog.vue";
import QuickPalette from "@/components/QuickPalette.vue";
import RuntimeInfoDialog from "@/components/RuntimeInfoDialog.vue";
import StickyManagerDialog from "@/components/StickyManagerDialog.vue";
import { inspectTemplateVariables } from "@/composables/useTemplateVariables";
import { copyPromptText } from "@/services/clipboard";
import { usePromptStore } from "@/stores/promptStore";
import type {
  Category,
  Prompt,
  PromptInput,
  PromptTab,
  PromptView,
} from "@/types/prompt";
import type { ImportMode, ImportPreview } from "@/types/backup";

const GENERAL_CATEGORY_ID = "10000000-0000-4000-8000-000000000006";
const DEFAULT_CATEGORY_IDS = new Set([
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  GENERAL_CATEGORY_ID,
]);

const store = usePromptStore();
const selected = ref<Prompt | null>(null);
const editing = ref<Prompt | null | undefined>(undefined);
const variableMode = ref(false);
const quickOpen = ref(false);
const stickyManagerOpen = ref(false);
const runtimeOpen = ref(false);
const categoryDialogOpen = ref(false);
const importPreview = ref<ImportPreview | null>(null);
const importing = ref(false);
const importError = ref("");
const saving = ref(false);
const saveError = ref("");
const copyingId = ref<string | null>(null);
const toast = ref<{ text: string; kind: "success" | "error" } | null>(null);
let stopListening: (() => void) | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function notify(text: string, kind: "success" | "error" = "success"): void {
  toast.value = { text, kind };
  window.setTimeout(() => {
    if (toast.value?.text === text) toast.value = null;
  }, 2600);
}

function setView(view: PromptView, categoryId?: string): void {
  void store.load({ view, categoryId, search: undefined, tab: "all" });
}

function setTab(tab: PromptTab): void {
  void store.load({ tab });
}

function updateSearch(value: string): void {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(
    () => void store.load({ search: value }),
    150,
  );
}

async function copy(prompt: Prompt): Promise<void> {
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) {
    selected.value = prompt;
    variableMode.value = false;
    notify(`${template.error.message}，请先编辑提示词正文`, "error");
    return;
  }
  if (template.variables.length) {
    selected.value = prompt;
    variableMode.value = true;
    return;
  }
  copyingId.value = prompt.id;
  try {
    const result = await copyPromptText({ id: prompt.id, text: prompt.body });
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
    copyingId.value = null;
  }
}

function promptActionLabel(prompt: Prompt): string {
  const template = inspectTemplateVariables(prompt.body);
  if (template.error) return "修正变量";
  return template.variables.length ? "填写变量" : "复制全文";
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

async function save(input: PromptInput, id?: string): Promise<void> {
  saving.value = true;
  saveError.value = "";
  try {
    const saved = await store.save(input, id);
    editing.value = undefined;
    selected.value = saved;
    notify(id ? "修改已保存" : "提示词已保存到本机");
  } catch (reason) {
    saveError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    saving.value = false;
  }
}

async function remove(prompt: Prompt): Promise<void> {
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
    selected.value = null;
    notify("提示词已删除");
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "删除失败", "error");
  }
}

async function createCategory(name: string): Promise<void> {
  try {
    await categoryApi.create(name);
    await store.load();
    categoryDialogOpen.value = false;
    notify("分类已创建");
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : String(reason), "error");
  }
}

function isCustomCategory(category: Category): boolean {
  return !DEFAULT_CATEGORY_IDS.has(category.id);
}

async function deleteCategory(category: Category): Promise<void> {
  if (!isCustomCategory(category)) return;
  const promptNotice = category.promptCount
    ? `其中 ${category.promptCount} 条提示词会移动到「通用效率」。`
    : "这个分类目前没有提示词，无需移动到「通用效率」。";
  if (
    !(await confirm(
      `确定删除分类「${category.name}」吗？${promptNotice}此操作不可撤销。`,
      { title: "删除分类？", kind: "warning" },
    ))
  )
    return;
  try {
    await categoryApi.delete(category.id, GENERAL_CATEGORY_ID);
    await store.load(
      store.query.categoryId === category.id
        ? {
            view: "all",
            tab: "all",
            categoryId: undefined,
            search: undefined,
          }
        : undefined,
    );
    notify("分类已删除，关联提示词已移到通用效率");
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "删除分类失败", "error");
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
  ) {
    return;
  }
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
  if (event.metaKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    quickOpen.value = true;
  } else if (event.metaKey && event.key.toLowerCase() === "f" && !editingText) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#main-search")?.focus();
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
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">P</span><span>PromptDock</span>
      </div>
      <p class="workspace-label">我的工作空间</p>
      <nav>
        <p class="nav-heading">工作台</p>
        <button
          :class="{
            active: store.query.view === 'all' && !store.query.categoryId,
          }"
          @click="setView('all')"
        >
          <span>▦ 全部提示词</span><b>{{ store.stats.total }}</b>
        </button>
        <button
          :class="{ active: store.query.view === 'recent' }"
          @click="setView('recent')"
        >
          <span>◷ 最近使用</span><b>{{ store.stats.recent }}</b>
        </button>
        <button
          :class="{ active: store.query.view === 'favorite' }"
          @click="setView('favorite')"
        >
          <span>☆ 我的收藏</span><b>{{ store.stats.favorites }}</b>
        </button>
        <button
          :class="{ active: store.query.view === 'pinned' }"
          @click="setView('pinned')"
        >
          <span>⌁ 快捷置顶</span><b>{{ store.stats.pinned }}</b>
        </button>
        <div class="nav-heading nav-heading-row">
          <span>分类管理</span
          ><button aria-label="新建分类" @click="categoryDialogOpen = true">
            ＋
          </button>
        </div>
        <div
          v-for="category in store.categories"
          :key="category.id"
          class="category-nav-item"
          :class="{
            active: store.query.categoryId === category.id,
            deletable: isCustomCategory(category),
          }"
        >
          <button
            class="category-select"
            :data-test="`category-${category.id}`"
            @click="setView('all', category.id)"
          >
            <span
              ><i :style="{ background: category.color }" />{{
                category.name
              }}</span
            ><b>{{ category.promptCount }}</b>
          </button>
          <button
            v-if="isCustomCategory(category)"
            class="category-delete"
            :data-test="`delete-category-${category.id}`"
            :aria-label="`删除分类 ${category.name}`"
            :title="`删除分类 ${category.name}`"
            @click.stop="deleteCategory(category)"
          >
            ×
          </button>
        </div>
      </nav>
      <div class="sidebar-bottom">
        <button @click="quickOpen = true">
          <span>⌘ 快捷取用</span><kbd>⌘K</kbd>
        </button>
        <button
          @click="
            windowApi
              .showSticky()
              .catch(() => notify('无法打开便签窗口', 'error'))
          "
        >
          <span>▤ 便签模式</span><small>5 槽位</small>
        </button>
        <button @click="stickyManagerOpen = true">
          <span>↕ 管理置顶</span><small>{{ store.pinned.length }}/5</small>
        </button>
        <button @click="runtimeOpen = true">
          <span>ⓘ 运行信息</span><small>本机</small>
        </button>
        <p>本机 SQLite 保存<br /><small>离线可用 · 不上传云端</small></p>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div>
          <span class="muted">工作台</span><span class="crumb">/</span
          ><strong>提示词库</strong>
        </div>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="previewImport">导入</button>
          <button class="ghost-button" @click="exportBackup">导出</button>
          <button class="ghost-button" @click="windowApi.showSticky()">
            ▤ 便签模式
          </button>
          <button class="primary-button" @click="editing = null">
            ＋ 新建提示词
          </button>
        </div>
      </header>

      <div class="content">
        <div class="title-row">
          <div>
            <h1>我的提示词库</h1>
            <p>整理、检索并复制你的常用 AI 工作流。</p>
          </div>
          <span class="local-badge">仅保存在这台 Mac</span>
        </div>
        <section class="search-panel">
          <label class="main-search"
            ><span>⌕</span
            ><input
              id="main-search"
              :value="store.query.search ?? ''"
              placeholder="搜索标题、正文、标签或分类…"
              @input="updateSearch(($event.target as HTMLInputElement).value)"
          /></label>
          <div class="tabs">
            <button
              :class="{ active: store.query.tab === 'all' }"
              @click="setTab('all')"
            >
              全部
            </button>
            <button
              :class="{ active: store.query.tab === 'favorite' }"
              @click="setTab('favorite')"
            >
              已收藏
            </button>
            <button
              :class="{ active: store.query.tab === 'template' }"
              @click="setTab('template')"
            >
              变量模板
            </button>
          </div>
          <select
            :value="store.query.sort"
            aria-label="排序"
            @change="
              store.load({
                sort: ($event.target as HTMLSelectElement).value as
                  'recent' | 'popular' | 'name',
              })
            "
          >
            <option value="recent">最近更新</option>
            <option value="popular">最常使用</option>
            <option value="name">标题排序</option>
          </select>
        </section>

        <section v-if="store.pinned.length" class="pinned-panel">
          <header>
            <div>
              <span class="section-icon">⌁</span
              ><span
                ><strong>快捷复制</strong><small>前 3 条便签置顶</small></span
              >
            </div>
            <div>
              <button @click="stickyManagerOpen = true">管理顺序</button>
              <button @click="windowApi.showSticky()">打开便签窗 →</button>
            </div>
          </header>
          <div class="pinned-grid">
            <button
              v-for="prompt in store.pinned.slice(0, 3)"
              :key="prompt.id"
              @click="copy(prompt)"
            >
              <span>{{ prompt.pinOrder?.toString().padStart(2, "0") }}</span
              ><strong>{{ prompt.title }}</strong
              ><small>{{ promptActionLabel(prompt) }}</small>
            </button>
          </div>
        </section>

        <div class="list-heading">
          <div>
            <h2>提示词列表</h2>
            <span>{{ store.total }} 条</span>
          </div>
          <span class="muted">点击卡片查看完整正文</span>
        </div>
        <div v-if="store.loading" class="empty-state">
          <span class="spinner" />正在读取本机数据库…
        </div>
        <div v-else-if="store.error" class="empty-state error-state">
          <strong>无法读取提示词</strong>
          <p>{{ store.error }}</p>
          <button class="primary-button" @click="store.load()">重试</button>
        </div>
        <div v-else-if="!store.prompts.length" class="empty-state">
          <span class="empty-icon">P</span
          ><strong>{{
            store.query.search ? "没有匹配结果" : "提示词库还是空的"
          }}</strong>
          <p>
            {{
              store.query.search
                ? "换个关键词，或清除搜索后重试。"
                : "创建第一条提示词，所有内容都会保存在本机 SQLite。"
            }}
          </p>
          <button
            class="primary-button"
            @click="
              store.query.search
                ? store.load({ search: undefined })
                : (editing = null)
            "
          >
            {{ store.query.search ? "清除搜索" : "新建提示词" }}
          </button>
        </div>
        <div v-else class="card-grid">
          <PromptCard
            v-for="prompt in store.prompts"
            :key="prompt.id"
            :prompt="prompt"
            :copying="copyingId === prompt.id"
            @select="
              selected = $event;
              variableMode = false;
            "
            @copy="copy"
            @favorite="toggleFavorite"
            @pin="togglePin"
          />
        </div>
      </div>
    </main>

    <PromptDetailDrawer
      v-if="selected"
      :prompt="selected"
      :variable-mode="variableMode"
      @close="
        selected = null;
        variableMode = false;
      "
      @edit="editing = $event"
      @copy="copy"
      @copied="
        notify('替换后的全文已复制');
        selected = null;
        store.load();
      "
    />
    <PromptEditorDialog
      v-if="editing !== undefined"
      :prompt="editing"
      :categories="store.categories"
      :saving="saving"
      :server-error="saveError"
      @save="save"
      @close="
        editing = undefined;
        saveError = '';
      "
      @delete="remove"
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
    <CategoryCreateDialog
      v-if="categoryDialogOpen"
      @close="categoryDialogOpen = false"
      @create="createCategory"
    />
    <div v-if="toast" class="toast" :class="toast.kind" aria-live="polite">
      {{ toast.kind === "success" ? "✓" : "!" }} {{ toast.text }}
    </div>
  </div>
</template>
