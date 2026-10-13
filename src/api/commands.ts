import { invoke } from "@tauri-apps/api/core";

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
