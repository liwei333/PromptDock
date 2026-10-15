import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Category, DashboardStats, Prompt } from "@/types/prompt";

const { categoryApi, promptApi } = vi.hoisted(() => ({
  categoryApi: {
    list: vi.fn(),
  },
  promptApi: {
    list: vi.fn(),
    listTags: vi.fn(),
    stats: vi.fn(),
    listSticky: vi.fn(),
  },
}));

vi.mock("@/api/commands", () => ({ categoryApi, promptApi }));

import { usePromptStore } from "@/stores/promptStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function makePrompt(id: string): Prompt {
  return {
    id,
    title: id,
    description: "",
    body: `${id} body`,
    categoryId: `${id}-category`,
    categoryName: `${id} category`,
    tags: [id],
    isFavorite: false,
    isPinned: false,
    pinOrder: null,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeCategory(id: string): Category {
  return {
    id,
    name: id,
    icon: "folder",
    color: "#64748B",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 1,
  };
}

function makeStats(total: number): DashboardStats {
  return {
    total,
    todayCopies: total,
    favorites: total,
    pinned: total,
    templates: total,
  };
}

describe("prompt store load ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    categoryApi.list.mockResolvedValue([]);
    promptApi.stats.mockResolvedValue(makeStats(0));
    promptApi.listSticky.mockResolvedValue([]);
    promptApi.listTags.mockResolvedValue([]);
  });

  it("keeps the newest complete load snapshot when an older response arrives later", async () => {
    const oldPage = deferred<{ items: Prompt[]; total: number }>();
    const newPage = deferred<{ items: Prompt[]; total: number }>();
    const oldPrompt = makePrompt("old");
    const newPrompt = makePrompt("new");
    const oldCategory = makeCategory("old-category");
    const newCategory = makeCategory("new-category");
    promptApi.list
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise);
    categoryApi.list
      .mockResolvedValueOnce([oldCategory])
      .mockResolvedValueOnce([newCategory]);
    promptApi.stats
      .mockResolvedValueOnce(makeStats(1))
      .mockResolvedValueOnce(makeStats(2));
    promptApi.listSticky
      .mockResolvedValueOnce([oldPrompt])
      .mockResolvedValueOnce([newPrompt]);
    promptApi.listTags
      .mockResolvedValueOnce(["old"])
      .mockResolvedValueOnce(["new"]);
    const store = usePromptStore();

    const olderLoad = store.load({ search: "old" });
    const newerLoad = store.load({ search: "new" });
    expect(promptApi.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ search: "old", limit: 200 }),
    );
    expect(promptApi.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ search: "new", limit: 200 }),
    );

    newPage.resolve({ items: [newPrompt], total: 2 });
    await newerLoad;
    expect(store.prompts).toEqual([newPrompt]);
    expect(store.total).toBe(2);
    expect(store.categories).toEqual([newCategory]);
    expect(store.stats).toEqual(makeStats(2));
    expect(store.pinned).toEqual([newPrompt]);
    expect(store.tags).toEqual(["new"]);

    oldPage.resolve({ items: [oldPrompt], total: 1 });
    await olderLoad;
    expect(store.prompts).toEqual([newPrompt]);
    expect(store.total).toBe(2);
    expect(store.categories).toEqual([newCategory]);
    expect(store.stats).toEqual(makeStats(2));
    expect(store.pinned).toEqual([newPrompt]);
    expect(store.tags).toEqual(["new"]);
  });

  it("does not let an older load finishing first clear the newer loading state", async () => {
    const oldPage = deferred<{ items: Prompt[]; total: number }>();
    const newPage = deferred<{ items: Prompt[]; total: number }>();
    const oldPrompt = makePrompt("old");
    const newPrompt = makePrompt("new");
    promptApi.list
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise);
    const store = usePromptStore();

    const olderLoad = store.load({ search: "old" });
    const newerLoad = store.load({ search: "new" });
    oldPage.resolve({ items: [oldPrompt], total: 1 });
    await olderLoad;

    expect(store.loading).toBe(true);
    expect(store.prompts).toEqual([]);

    newPage.resolve({ items: [newPrompt], total: 1 });
    await newerLoad;
    expect(store.loading).toBe(false);
    expect(store.prompts).toEqual([newPrompt]);
  });

  it("does not let an older load error replace a newer successful snapshot", async () => {
    const oldPage = deferred<{ items: Prompt[]; total: number }>();
    const newPage = deferred<{ items: Prompt[]; total: number }>();
    const newPrompt = makePrompt("new");
    promptApi.list
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise);
    const store = usePromptStore();

    const olderLoad = store.load({ search: "old" });
    const newerLoad = store.load({ search: "new" });
    newPage.resolve({ items: [newPrompt], total: 1 });
    await newerLoad;
    oldPage.reject(new Error("stale load failure"));
    await olderLoad;

    expect(store.prompts).toEqual([newPrompt]);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
});
