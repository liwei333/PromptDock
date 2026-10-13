import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  Category,
  CopyStats,
  DashboardStats,
  Prompt,
  PromptInput,
  PromptPage,
  PromptQuery,
} from "@/types/prompt";
import type { RuntimeInfo, StickySettings } from "@/types/runtime";
import type {
  ExportResult,
  ImportMode,
  ImportPreview,
  ImportResult,
} from "@/types/backup";

export const promptApi = {
  list: (query: PromptQuery = {}) =>
    invoke<PromptPage>("list_prompts", { query }),
  get: (id: string) => invoke<Prompt>("get_prompt", { id }),
  create: (input: PromptInput) => invoke<Prompt>("create_prompt", { input }),
  update: (id: string, input: PromptInput) =>
    invoke<Prompt>("update_prompt", { id, input }),
  delete: (id: string) => invoke<{ deleted: true }>("delete_prompt", { id }),
  setFavorite: (id: string, value: boolean) =>
    invoke<Prompt>("set_favorite", { id, value }),
  setPinned: (id: string, value: boolean) =>
    invoke<Prompt>("set_pinned", { id, value }),
  recordSuccessfulCopy: (id: string) =>
    invoke<CopyStats>("record_successful_copy", { id }),
  listSticky: () => invoke<Prompt[]>("list_sticky_prompts"),
  reorderSticky: (orderedIds: string[]) =>
    invoke<Prompt[]>("reorder_sticky_prompts", { orderedIds }),
  stats: () => invoke<DashboardStats>("get_dashboard_stats"),
};

export const categoryApi = {
  list: () => invoke<Category[]>("list_categories"),
  create: (name: string) => invoke<Category>("create_category", { name }),
  rename: (id: string, name: string) =>
    invoke<Category>("rename_category", { id, name }),
  delete: (id: string, moveToCategoryId: string) =>
    invoke<{ deleted: true }>("delete_category", { id, moveToCategoryId }),
};

export const windowApi = {
  showQuick: (promptId?: string) =>
    invoke<{ shown: true }>("show_quick_window", { promptId }),
  hideQuick: () => invoke<{ hidden: true }>("hide_quick_window"),
  showSticky: () => invoke<{ shown: true }>("show_sticky_window"),
  hideSticky: () => invoke<{ hidden: true }>("hide_sticky_window"),
  getStickySettings: () => invoke<StickySettings>("get_sticky_settings"),
  setStickySettings: (settings: Partial<StickySettings>) =>
    invoke<StickySettings>("set_sticky_settings", { settings }),
  runtimeInfo: () => invoke<RuntimeInfo>("get_runtime_info"),
};

export const backupApi = {
  exportWithDialog: async (): Promise<ExportResult> => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
    const destinationPath = await save({
      title: "导出 PromptDock 备份",
      defaultPath: `PromptDock_backup_${stamp}.json`,
      filters: [{ name: "PromptDock JSON", extensions: ["json"] }],
    });
    return invoke<ExportResult>("export_backup", { destinationPath });
  },
  previewWithDialog: async (): Promise<ImportPreview | null> => {
    const sourcePath = await open({
      title: "选择 PromptDock JSON 备份",
      multiple: false,
      directory: false,
      filters: [{ name: "PromptDock JSON", extensions: ["json"] }],
    });
    const result = await invoke<{
      cancelled: boolean;
      token: string | null;
      summary: ImportPreview["summary"] | null;
    }>("preview_import_backup", { sourcePath });
    if (result.cancelled || !result.token || !result.summary) return null;
    return { token: result.token, summary: result.summary };
  },
  commit: (token: string, mode: ImportMode) =>
    invoke<ImportResult>("commit_import_backup", { token, mode }),
  cancel: (token: string) => invoke<void>("cancel_import_backup", { token }),
};
