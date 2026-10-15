import { createPinia } from "pinia";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CopyResult } from "@/services/clipboard";

const {
  backupApi,
  categoryApi,
  copyPromptText,
  listen,
  pinnedPrompt,
  promptApi,
  secondPrompt,
  windowApi,
} = vi.hoisted(() => {
  const pinnedPrompt = {
    id: "pinned-1",
    title: "固定提示词",
    description: "",
    body: "固定正文",
    categoryId: "category-1",
    categoryName: "通用效率",
    tags: [],
    isFavorite: false,
    isPinned: true,
    pinOrder: 1,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const secondPrompt = {
    ...pinnedPrompt,
    id: "prompt-2",
    title: "第二条提示词",
    body: "第二条正文",
    isPinned: false,
    pinOrder: null,
  };

  return {
    backupApi: {
      exportWithDialog: vi.fn(),
      previewWithDialog: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    },
    categoryApi: {
      list: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
    },
    copyPromptText: vi.fn(),
    listen: vi.fn(),
    promptApi: {
      list: vi.fn(),
      listTags: vi.fn(),
      stats: vi.fn(),
      listSticky: vi.fn(),
      setFavorite: vi.fn(),
      setPinned: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    windowApi: {
      enterStickyMode: vi.fn(),
    },
    pinnedPrompt,
    secondPrompt,
  };
});

vi.mock("@/api/commands", () => ({
  backupApi,
  categoryApi,
  promptApi,
  windowApi,
}));

vi.mock("@tauri-apps/api/event", () => ({ listen }));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));

import MainWindow from "@/windows/MainWindow.vue";
import DashboardStatCards from "@/components/DashboardStatCards.vue";
import PromptEditorDialog from "@/components/PromptEditorDialog.vue";
import PromptListPane from "@/components/PromptListPane.vue";
import WorkbenchIconRail from "@/components/WorkbenchIconRail.vue";

const STICKY_ENTRY_SELECTOR = "[data-test='rail-sticky-mode']";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function successfulCopyResult(copyCount = 1): CopyResult {
  return {
    status: "copied",
    stats: { copyCount, lastCopiedAt: 2 },
  };
}

async function mountMainWindow(attachToBody = false) {
  const wrapper = mount(MainWindow, {
    ...(attachToBody ? { attachTo: document.body } : {}),
    global: {
      plugins: [createPinia()],
      stubs: {
        CategoryCreateDialog: true,
        ImportPreviewDialog: true,
        PromptCard: true,
        PromptDetailDrawer: true,
        PromptEditorDialog: true,
        QuickPalette: true,
        RuntimeInfoDialog: true,
        StickyManagerDialog: true,
        Teleport: false,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

async function chooseCategoryOption(
  wrapper: VueWrapper,
  optionLabel: string,
): Promise<void> {
  await wrapper
    .get('button[role="combobox"][aria-label="分类筛选"]')
    .trigger("keydown", { key: "Enter", code: "Enter" });
  await flushPromises();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await flushPromises();

  const option = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((candidate) => candidate.textContent?.trim() === optionLabel);
  expect(option, `Expected category option named ${optionLabel}`).toBeDefined();
  option!.dispatchEvent(
    new MouseEvent("pointerup", { bubbles: true, button: 0 }),
  );
  await flushPromises();
}

describe("MainWindow V3 workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    promptApi.stats.mockResolvedValue({
      total: 0,
      todayCopies: 0,
      favorites: 0,
      pinned: 1,
      templates: 0,
    });
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    promptApi.listTags.mockResolvedValue([]);
    categoryApi.list.mockResolvedValue([
      {
        id: "category-1",
        name: "通用效率",
        icon: "sparkles",
        color: "#6687AE",
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
        promptCount: 1,
      },
      {
        id: "category-2",
        name: "写作创作",
        icon: "pen",
        color: "#7B75B5",
        sortOrder: 2,
        createdAt: 1,
        updatedAt: 1,
        promptCount: 0,
      },
    ]);
    backupApi.previewWithDialog.mockResolvedValue(null);
    backupApi.exportWithDialog.mockResolvedValue({
      cancelled: true,
      promptCount: 0,
    });
    copyPromptText.mockResolvedValue(successfulCopyResult());
    listen.mockResolvedValue(() => undefined);
    windowApi.enterStickyMode.mockResolvedValue({ mode: "sticky" });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  it("renders labelled SVG rail actions with selection state and a focus tooltip", async () => {
    vi.useFakeTimers();
    const rail = mount(WorkbenchIconRail, {
      attachTo: document.body,
      props: { favoriteActive: true },
      global: { stubs: { Teleport: false } },
    });

    try {
      const buttons = rail.findAll("button");
      expect(buttons).toHaveLength(5);
      expect(rail.findAll("button svg")).toHaveLength(5);
      expect(rail.find(".mac-lights").exists()).toBe(false);
      expect(rail.text()).not.toMatch(/[⌂☆▢▤⚙]/u);
      expect(
        rail.get('[data-test="rail-home"]').attributes("aria-current"),
      ).toBe("page");
      expect(
        rail.get('[data-test="rail-favorites"]').attributes("aria-pressed"),
      ).toBe("true");

      const home = rail.get<HTMLButtonElement>('[data-test="rail-home"]');
      home.element.focus();
      await vi.advanceTimersByTimeAsync(500);
      expect(
        document.body.querySelector(".pd-tooltip-content")?.textContent,
      ).toContain("工作台");

      await home.trigger("click");
      await rail.get('[data-test="rail-favorites"]').trigger("click");
      await rail.get('[data-test="rail-categories"]').trigger("click");
      await rail.get('[data-test="rail-sticky-mode"]').trigger("click");
      await rail.get('[data-test="rail-settings"]').trigger("click");
      expect(rail.emitted("home")).toHaveLength(1);
      expect(rail.emitted("favorites")).toHaveLength(1);
      expect(rail.emitted("categories")).toHaveLength(1);
      expect(rail.emitted("sticky")).toHaveLength(1);
      expect(rail.emitted("settings")).toHaveLength(1);
    } finally {
      rail.unmount();
    }
  });

  it("keeps all real statistic values noninteractive and shows five pin-capacity segments", () => {
    const cards = mount(DashboardStatCards, {
      props: {
        stats: {
          total: 27,
          todayCopies: 8,
          favorites: 11,
          pinned: 3,
          templates: 4,
        },
      },
    });

    try {
      expect(cards.get('[data-test="stat-total"]').text()).toContain("27");
      expect(cards.get('[data-test="stat-today"]').text()).toContain("8");
      expect(cards.get('[data-test="stat-favorites"]').text()).toContain("11");
      expect(cards.get('[data-test="stat-pinned"]').text()).toContain("3/5");
      expect(cards.findAll("article svg")).toHaveLength(4);
      expect(cards.find("article button").exists()).toBe(false);
      expect(
        cards.get('[data-test="stat-pinned"] strong').attributes("aria-label"),
      ).toContain("3/5");
      expect(cards.findAll('[data-test="pin-capacity-segment"]')).toHaveLength(
        5,
      );
    } finally {
      cards.unmount();
    }
  });

  it("renders the V3 rail, four real stats, filters, and split workbench", async () => {
    const wrapper = await mountMainWindow();

    expect(wrapper.find(".workbench-rail").exists()).toBe(true);
    expect(wrapper.findAll(".dashboard-stat-grid article")).toHaveLength(4);
    expect(wrapper.find("[data-test='filter-category']").exists()).toBe(true);
    expect(wrapper.find(".prompt-list-pane").exists()).toBe(true);
    expect(wrapper.find(".prompt-detail-pane").exists()).toBe(true);
    expect(wrapper.get("[data-test='stat-today']").text()).toContain(
      "今日复制次数",
    );

    await wrapper.get(STICKY_ENTRY_SELECTOR).trigger("click");
    await flushPromises();

    expect(windowApi.enterStickyMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("suppresses repeated sticky transitions while the native call is pending", async () => {
    let resolveTransition!: (value: { mode: "sticky" }) => void;
    windowApi.enterStickyMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = await mountMainWindow();
    const entry = wrapper.get(STICKY_ENTRY_SELECTOR);

    const firstClick = entry.trigger("click");
    const secondClick = entry.trigger("click");
    await Promise.all([firstClick, secondClick]);

    expect(windowApi.enterStickyMode).toHaveBeenCalledOnce();
    expect(
      wrapper.get(STICKY_ENTRY_SELECTOR).attributes("disabled"),
    ).toBeDefined();

    resolveTransition({ mode: "sticky" });
    await flushPromises();
    expect(
      wrapper.get(STICKY_ENTRY_SELECTOR).attributes("disabled"),
    ).toBeUndefined();
    wrapper.unmount();
  });

  it("renders accessible feedback when the native transition is rejected", async () => {
    windowApi.enterStickyMode.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = await mountMainWindow();
    const liveRegion = wrapper.get("[data-test='main-live-region']");
    const liveRegionElement = liveRegion.element;

    expect(liveRegion.text()).toBe("");

    await wrapper.get(STICKY_ENTRY_SELECTOR).trigger("click");
    await flushPromises();

    const updatedLiveRegion = wrapper.get("[data-test='main-live-region']");
    expect(updatedLiveRegion.element).toBe(liveRegionElement);
    expect(updatedLiveRegion.text()).toContain("无法切换到便签模式");
    wrapper.unmount();
  });

  it("opens the quick palette with the Windows Ctrl+K shortcut", async () => {
    const wrapper = await mountMainWindow();

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".palette-overlay").exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not retarget an open editor with Cmd/Ctrl+N, then opens new after close", async () => {
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const wrapper = await mountMainWindow(true);

    try {
      await wrapper.get("[data-test='detail-edit']").trigger("click");
      await flushPromises();
      const editor = wrapper.findComponent(PromptEditorDialog);
      expect(editor.exists()).toBe(true);
      expect(editor.props("prompt")).toEqual(
        expect.objectContaining({ id: "pinned-1" }),
      );

      const focusedButton = wrapper.get<HTMLButtonElement>(
        "[data-test='detail-edit']",
      );
      focusedButton.element.focus();
      focusedButton.element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "n",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await flushPromises();
      expect(wrapper.findComponent(PromptEditorDialog).props("prompt")).toEqual(
        expect.objectContaining({ id: "pinned-1" }),
      );

      editor.vm.$emit("close");
      await flushPromises();
      expect(wrapper.findComponent(PromptEditorDialog).exists()).toBe(false);
      focusedButton.element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "n",
          metaKey: true,
          bubbles: true,
        }),
      );
      await flushPromises();
      const newEditor = wrapper.findComponent(PromptEditorDialog);
      expect(newEditor.exists()).toBe(true);
      expect(newEditor.props("prompt")).toBeNull();
    } finally {
      wrapper.unmount();
    }
  });

  it("opens category management from rail, list, and category filter", async () => {
    const wrapper = await mountMainWindow(true);

    try {
      for (const selector of [
        "[data-test='rail-categories']",
        "[data-test='list-manage-categories']",
      ]) {
        await wrapper.get(selector).trigger("click");
        expect(
          document.body.querySelector(".category-manager-dialog"),
        ).not.toBeNull();
        document.body
          .querySelector<HTMLButtonElement>("[aria-label='关闭分类管理']")!
          .click();
        await flushPromises();
      }

      await chooseCategoryOption(wrapper, "管理分类…");
      expect(
        document.body.querySelector(".category-manager-dialog"),
      ).not.toBeNull();
    } finally {
      wrapper.unmount();
    }
  });

  it("starts the full copied interval before a slow prompt reload finishes", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({
      items: [pinnedPrompt, secondPrompt],
      total: 2,
    });
    const pending = deferred<CopyResult>();
    const reload = deferred<{
      items: (typeof pinnedPrompt)[];
      total: number;
    }>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = await mountMainWindow();

    try {
      promptApi.list.mockReturnValueOnce(reload.promise);
      await wrapper.findAll("[data-test='list-copy']")[0].trigger("click");
      await wrapper.vm.$nextTick();

      let firstCopy = wrapper.findAll("[data-test='list-copy']")[0];
      expect(firstCopy.attributes("disabled")).toBeDefined();
      expect(firstCopy.attributes("aria-label")).not.toBe("已复制");

      pending.resolve(successfulCopyResult());
      await flushPromises();

      const listPane = wrapper.findComponent(PromptListPane);
      expect(listPane.props("copyingId")).toBeNull();
      expect(listPane.props("copiedId")).toBe(pinnedPrompt.id);
      const visibleCopy = wrapper.findAll("[data-test='list-copy']")[0];
      expect(visibleCopy.exists()).toBe(true);
      expect(visibleCopy.attributes("disabled")).toBeUndefined();
      expect(visibleCopy.attributes("aria-busy")).toBeUndefined();
      expect(visibleCopy.attributes("aria-label")).toBe("已复制");
      expect(visibleCopy.get("svg").classes()).toContain("lucide-check");
      expect(wrapper.get(".v3-prompt-list").attributes("aria-busy")).toBe(
        "true",
      );
      expect(wrapper.find(".toast svg").exists()).toBe(true);
      expect(wrapper.get(".toast").text()).not.toMatch(/[✓!]/u);

      await vi.advanceTimersByTimeAsync(1199);
      expect(listPane.props("copiedId")).toBe(pinnedPrompt.id);
      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("已复制");
      await vi.advanceTimersByTimeAsync(1);
      expect(listPane.props("copiedId")).toBeNull();
      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("复制提示词");

      reload.resolve({ items: [pinnedPrompt], total: 1 });
      await flushPromises();
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("复制提示词");
    } finally {
      wrapper.unmount();
    }
  });

  it("treats copied-with-stats-error as copied while retaining the nonfatal warning", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const pending = deferred<CopyResult>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.get("[data-test='list-copy']").trigger("click");
      pending.resolve({
        status: "copied-with-stats-error",
        error: new Error("stats unavailable"),
      });
      await flushPromises();

      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
      expect(wrapper.get("[data-test='main-live-region']").text()).toContain(
        "已复制，但使用次数暂未更新",
      );
      expect(wrapper.get(".toast").classes()).toContain("error");

      await vi.advanceTimersByTimeAsync(1200);
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("复制提示词");
    } finally {
      wrapper.unmount();
    }
  });

  it("never exposes copied success when clipboard writing rejects", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const pending = deferred<CopyResult>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.get("[data-test='list-copy']").trigger("click");
      pending.reject(new Error("无法写入系统剪贴板"));
      await flushPromises();

      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("复制提示词");
      expect(wrapper.get("[data-test='main-live-region']").text()).toContain(
        "无法写入系统剪贴板",
      );
      expect(wrapper.find(".toast svg").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1200);
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).not.toBe("已复制");
    } finally {
      wrapper.unmount();
    }
  });

  it("moves copied success to the latest row and cancels the old timer", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({
      items: [pinnedPrompt, secondPrompt],
      total: 2,
    });
    const firstPending = deferred<CopyResult>();
    const secondPending = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.findAll("[data-test='list-copy']")[0].trigger("click");
      firstPending.resolve(successfulCopyResult());
      await flushPromises();
      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("已复制");

      await vi.advanceTimersByTimeAsync(600);
      await wrapper.findAll("[data-test='list-copy']")[1].trigger("click");
      secondPending.resolve(successfulCopyResult(2));
      await flushPromises();

      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("复制提示词");
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");

      await vi.advanceTimersByTimeAsync(600);
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");
      await vi.advanceTimersByTimeAsync(600);
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("复制提示词");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the newer prompt pending when an older copy resolves", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({
      items: [pinnedPrompt, secondPrompt],
      total: 2,
    });
    const olderCopy = deferred<CopyResult>();
    const newerCopy = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(olderCopy.promise)
      .mockReturnValueOnce(newerCopy.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.findAll("[data-test='list-copy']")[0].trigger("click");
      await wrapper.findAll("[data-test='list-copy']")[1].trigger("click");

      olderCopy.resolve(successfulCopyResult());
      await flushPromises();

      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("复制提示词");
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("disabled"),
      ).toBeDefined();
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-busy"),
      ).toBe("true");

      newerCopy.resolve(successfulCopyResult(2));
      await flushPromises();
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the newer prompt pending when an older copy rejects", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({
      items: [pinnedPrompt, secondPrompt],
      total: 2,
    });
    const olderCopy = deferred<CopyResult>();
    const newerCopy = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(olderCopy.promise)
      .mockReturnValueOnce(newerCopy.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.findAll("[data-test='list-copy']")[0].trigger("click");
      await wrapper.findAll("[data-test='list-copy']")[1].trigger("click");

      olderCopy.reject(new Error("older clipboard failure"));
      await flushPromises();

      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("disabled"),
      ).toBeDefined();
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-busy"),
      ).toBe("true");

      newerCopy.resolve(successfulCopyResult(2));
      await flushPromises();
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");
    } finally {
      wrapper.unmount();
    }
  });

  it("does not let an older reverse completion replace newer copied feedback", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({
      items: [pinnedPrompt, secondPrompt],
      total: 2,
    });
    const olderCopy = deferred<CopyResult>();
    const newerCopy = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(olderCopy.promise)
      .mockReturnValueOnce(newerCopy.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.findAll("[data-test='list-copy']")[0].trigger("click");
      await wrapper.findAll("[data-test='list-copy']")[1].trigger("click");

      newerCopy.resolve(successfulCopyResult(2));
      await flushPromises();
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");

      await vi.advanceTimersByTimeAsync(400);
      olderCopy.resolve(successfulCopyResult());
      await flushPromises();

      expect(
        wrapper.findAll("[data-test='list-copy']")[0].attributes("aria-label"),
      ).toBe("复制提示词");
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");

      await vi.advanceTimersByTimeAsync(799);
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("已复制");
      await vi.advanceTimersByTimeAsync(1);
      expect(
        wrapper.findAll("[data-test='list-copy']")[1].attributes("aria-label"),
      ).toBe("复制提示词");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps a repeated prompt copy pending when the older request rejects", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const olderCopy = deferred<CopyResult>();
    const newerCopy = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(olderCopy.promise)
      .mockReturnValueOnce(newerCopy.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.get("[data-test='list-copy']").trigger("click");
      await wrapper.get("[data-test='detail-copy']").trigger("click");
      expect(copyPromptText).toHaveBeenCalledTimes(2);

      olderCopy.reject(new Error("stale same-prompt failure"));
      await flushPromises();

      const listCopy = wrapper.get("[data-test='list-copy']");
      expect(listCopy.attributes("disabled")).toBeDefined();
      expect(listCopy.attributes("aria-busy")).toBe("true");
      expect(wrapper.get("[data-test='main-live-region']").text()).toBe("");

      newerCopy.resolve(successfulCopyResult(2));
      await flushPromises();
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
    } finally {
      wrapper.unmount();
    }
  });

  it("ignores an older repeated-prompt success after the newer request succeeds", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const olderCopy = deferred<CopyResult>();
    const newerCopy = deferred<CopyResult>();
    copyPromptText
      .mockReturnValueOnce(olderCopy.promise)
      .mockReturnValueOnce(newerCopy.promise);
    const wrapper = await mountMainWindow();

    try {
      await wrapper.get("[data-test='list-copy']").trigger("click");
      await wrapper.get("[data-test='detail-copy']").trigger("click");

      newerCopy.resolve(successfulCopyResult(2));
      await flushPromises();
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
      expect(wrapper.get("[data-test='main-live-region']").text()).toBe(
        "完整正文已复制",
      );

      await vi.advanceTimersByTimeAsync(400);
      olderCopy.resolve({
        status: "copied-with-stats-error",
        error: new Error("stale stats failure"),
      });
      await flushPromises();

      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
      expect(wrapper.get("[data-test='main-live-region']").text()).toBe(
        "完整正文已复制",
      );

      await vi.advanceTimersByTimeAsync(799);
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
      await vi.advanceTimersByTimeAsync(1);
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("复制提示词");
    } finally {
      wrapper.unmount();
    }
  });

  it("clears the outstanding copied timer before MainWindow unmounts", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const pending = deferred<CopyResult>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wrapper = await mountMainWindow();
    let unmounted = false;

    try {
      await wrapper.get("[data-test='list-copy']").trigger("click");
      pending.resolve(successfulCopyResult());
      await flushPromises();
      expect(
        wrapper.get("[data-test='list-copy']").attributes("aria-label"),
      ).toBe("已复制");
      const { setupState } = wrapper.vm.$ as unknown as {
        setupState: { copiedId: string | null };
      };

      wrapper.unmount();
      unmounted = true;
      await vi.advanceTimersByTimeAsync(1200);

      expect(setupState.copiedId).toBe(pinnedPrompt.id);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      if (!unmounted) wrapper.unmount();
      warn.mockRestore();
    }
  });

  it("ignores a pending clipboard success after MainWindow unmounts", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const pending = deferred<CopyResult>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = await mountMainWindow();
    const { setupState } = wrapper.vm.$ as unknown as {
      setupState: {
        copiedId: string | null;
        copyingId: string | null;
        toast: { text: string } | null;
      };
    };

    await wrapper.get("[data-test='list-copy']").trigger("click");
    expect(setupState.copyingId).toBe(pinnedPrompt.id);
    expect(promptApi.list).toHaveBeenCalledTimes(1);
    wrapper.unmount();

    pending.resolve(successfulCopyResult());
    await flushPromises();

    expect(setupState.copyingId).toBe(pinnedPrompt.id);
    expect(setupState.copiedId).toBeNull();
    expect(setupState.toast).toBeNull();
    expect(promptApi.list).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a pending clipboard rejection after MainWindow unmounts", async () => {
    vi.useFakeTimers();
    promptApi.list.mockResolvedValue({ items: [pinnedPrompt], total: 1 });
    const pending = deferred<CopyResult>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = await mountMainWindow();
    const { setupState } = wrapper.vm.$ as unknown as {
      setupState: {
        copiedId: string | null;
        copyingId: string | null;
        toast: { text: string } | null;
      };
    };

    await wrapper.get("[data-test='list-copy']").trigger("click");
    wrapper.unmount();
    pending.reject(new Error("late clipboard failure"));
    await flushPromises();

    expect(setupState.copyingId).toBe(pinnedPrompt.id);
    expect(setupState.copiedId).toBeNull();
    expect(setupState.toast).toBeNull();
    expect(promptApi.list).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("immediately removes a listener whose registration finishes after unmount", async () => {
    const registration = deferred<() => void>();
    const unlisten = vi.fn();
    listen.mockReturnValueOnce(registration.promise);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const wrapper = await mountMainWindow();

    expect(listen).toHaveBeenCalledOnce();
    wrapper.unmount();
    registration.resolve(unlisten);
    await flushPromises();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("renders low-emphasis status actions with SVG icons and preserves handlers", async () => {
    const wrapper = await mountMainWindow();
    const actions = wrapper.findAll(".v3-status-actions .pd-button");

    expect(actions).toHaveLength(3);
    expect(wrapper.findAll(".v3-status-actions svg")).toHaveLength(3);
    expect(wrapper.get(".v3-status-actions").text()).not.toContain("·");

    await wrapper.get("[data-test='manage-sticky']").trigger("click");
    await wrapper.get("[data-test='status-import']").trigger("click");
    await wrapper.get("[data-test='status-export']").trigger("click");
    await flushPromises();

    expect(wrapper.find("sticky-manager-dialog-stub").exists()).toBe(true);
    expect(backupApi.previewWithDialog).toHaveBeenCalledOnce();
    expect(backupApi.exportWithDialog).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
