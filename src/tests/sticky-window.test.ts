// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import auxiliaryCapability from "../../src-tauri/capabilities/auxiliary.json";
import type { Prompt } from "@/types/prompt";

const pinnedPrompt: Prompt = {
  id: "pinned-1",
  title: "Codex 执行反馈模板",
  description: "用于让 Codex 按步骤执行任务并返回结构化执行结果。",
  body: "完整正文",
  categoryId: "category-1",
  categoryName: "开发工具",
  tags: ["Codex"],
  isFavorite: true,
  isPinned: true,
  pinOrder: 1,
  copyCount: 12,
  lastCopiedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const { copyPromptText, listen, promptApi, windowApi } = vi.hoisted(() => ({
  copyPromptText: vi.fn(),
  listen: vi.fn(),
  promptApi: { listSticky: vi.fn() },
  windowApi: {
    enterMainMode: vi.fn(),
    hideSticky: vi.fn(),
    showQuick: vi.fn(),
    getStickySettings: vi.fn(),
    setStickySettings: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("@/api/commands", () => ({
  promptApi,
  windowApi,
}));
vi.mock("@/services/clipboard", () => ({ copyPromptText }));

import StickyWindow from "@/windows/StickyWindow.vue";

const stickySource = readFileSync(
  resolve("src/windows/StickyWindow.vue"),
  "utf8",
);
const globalCss = readFileSync(resolve("src/styles/global.css"), "utf8");

function pinnedPromptAt(index: number): Prompt {
  return {
    ...pinnedPrompt,
    id: `pinned-${index}`,
    title: `置顶提示词 ${index}`,
    description: `第 ${index} 条说明`,
    body: `第 ${index} 条正文`,
    pinOrder: index,
    updatedAt: index,
  };
}

const fivePinnedPrompts = Array.from({ length: 5 }, (_, index) =>
  pinnedPromptAt(index + 1),
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mountSticky() {
  return mount(StickyWindow, {
    attachTo: document.body,
    global: { stubs: { Teleport: false } },
  });
}

describe("StickyWindow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listen.mockResolvedValue(() => undefined);
    promptApi.listSticky.mockResolvedValue([]);
    windowApi.enterMainMode.mockResolvedValue({ mode: "main" });
    windowApi.hideSticky.mockResolvedValue({ hidden: true });
    windowApi.showQuick.mockResolvedValue({ shown: true });
    windowApi.getStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "comfortable",
    });
    windowApi.setStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "comfortable",
    });
    copyPromptText.mockResolvedValue({
      status: "copied",
      stats: { copyCount: 13, lastCopiedAt: 2 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("removes simulated traffic lights and legacy Unicode control glyphs", () => {
    expect(stickySource).not.toContain("sticky-traffic");
    for (const glyph of ["⌖", "⌁", "⚙", "⇅", "▣", "＋", "⋯"]) {
      expect(stickySource).not.toContain(glyph);
    }
  });

  it("grants the sticky window permission to start native dragging", () => {
    expect(auxiliaryCapability.windows).toContain("sticky");
    expect(auxiliaryCapability.permissions).toContain(
      "core:window:allow-start-dragging",
    );
  });

  it("marks the complete titlebar as a native deep drag region", () => {
    const wrapper = mount(StickyWindow);

    expect(
      wrapper.get(".sticky-titlebar").attributes("data-tauri-drag-region"),
    ).toBe("deep");
    wrapper.unmount();
  });

  it("gives every icon-only titlebar action a focused visible tooltip", async () => {
    const wrapper = mountSticky();
    await flushPromises();

    for (const label of ["便签设置", "切换到完整模式", "收起便签"]) {
      const control = wrapper.get(`button[aria-label='${label}']`);
      await control.trigger("focus");
      await nextTick();
      const tooltip = document.body.querySelector<HTMLElement>(
        ".pd-tooltip-content",
      );
      expect(tooltip?.textContent).toContain(label);
      await control.trigger("blur");
      await nextTick();
    }

    wrapper.unmount();
  });

  it("always renders five fixed slots when the library has no pins", async () => {
    const wrapper = mount(StickyWindow);
    await flushPromises();
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(wrapper.text()).toContain("空位 1");
    expect(wrapper.text()).toContain("置顶 0 条");
    const empty = wrapper.get("[data-test='sticky-slot']");
    expect(empty.attributes("aria-label")).toContain("空位 1");
    expect(empty.find(".lucide-plus").exists()).toBe(true);
    await empty.trigger("click");
    await flushPromises();
    expect(windowApi.enterMainMode).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("renders descriptions in comfortable density and keeps five slots", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(wrapper.get(".sticky-description").text()).toContain(
      pinnedPrompt.description,
    );
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(
      wrapper.get("[data-test='sticky-slot']").attributes("aria-label"),
    ).toContain("复制");
    expect(wrapper.find(".lucide-grip-vertical").exists()).toBe(true);
    expect(wrapper.find(".lucide-copy").exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps all five real pins in manual order with two-line descriptions in comfortable density", async () => {
    promptApi.listSticky.mockResolvedValue(fivePinnedPrompts);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(
      wrapper.findAll(".sticky-row-title").map((row) => row.text()),
    ).toEqual(fivePinnedPrompts.map((prompt) => prompt.title));
    expect(
      wrapper.findAll(".sticky-description").map((row) => row.text()),
    ).toEqual(fivePinnedPrompts.map((prompt) => prompt.description));
    expect(globalCss).toMatch(
      /\.sticky-description\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/,
    );
    wrapper.unmount();
  });

  it("persists compact density and removes descriptions from compact rows", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockResolvedValueOnce({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "compact",
    });
    const wrapper = mountSticky();
    await flushPromises();

    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    document.body
      .querySelector<HTMLButtonElement>("[data-test='sticky-density-toggle']")!
      .click();
    await flushPromises();

    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      density: "compact",
    });
    expect(wrapper.get(".sticky-window").classes()).toContain("compact");
    expect(wrapper.find(".sticky-description").exists()).toBe(false);
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    wrapper.unmount();
  });

  it("keeps five ordered title-only rows and the footer in compact density", async () => {
    promptApi.listSticky.mockResolvedValue(fivePinnedPrompts);
    windowApi.setStickySettings.mockResolvedValueOnce({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "compact",
    });
    const wrapper = mountSticky();
    await flushPromises();

    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    document.body
      .querySelector<HTMLButtonElement>("[data-test='sticky-density-toggle']")!
      .click();
    await flushPromises();

    expect(
      wrapper.findAll(".sticky-row-title").map((row) => row.text()),
    ).toEqual(fivePinnedPrompts.map((prompt) => prompt.title));
    expect(wrapper.findAll(".sticky-description")).toHaveLength(0);
    expect(wrapper.get(".sticky-footer").text()).toContain("管理");
    expect(wrapper.get(".sticky-footer").text()).toContain("排序");
    expect(wrapper.get(".sticky-footer").text()).toContain("始终置顶");
    wrapper.unmount();
  });

  it("opens a named settings dialog, moves focus inside, dismisses with Escape, and restores focus", async () => {
    const wrapper = mountSticky();
    await flushPromises();
    const trigger = wrapper.get("[data-test='sticky-menu']");
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog).not.toBeNull();
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toContain("便签设置");
    expect(dialog.contains(document.activeElement)).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await flushPromises();

    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("prevents Escape, outside, and close dismissal while density transition is pending", async () => {
    const pending = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      density: "compact";
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
    }>();
    windowApi.setStickySettings.mockReturnValueOnce(pending.promise);
    const wrapper = mountSticky();
    await flushPromises();
    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    await flushPromises();
    document.body
      .querySelector<HTMLButtonElement>("[data-test='sticky-density-toggle']")!
      .click();
    await nextTick();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    document.body
      .querySelector<HTMLElement>(".pd-dialog-overlay")!
      .dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    document.body
      .querySelector<HTMLButtonElement>("button[aria-label='关闭便签设置']")!
      .click();
    await flushPromises();

    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    pending.resolve({
      visible: true,
      alwaysOnTop: true,
      density: "compact",
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
    });
    await flushPromises();
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    wrapper.unmount();
  });

  it("uses a disabled role switch while always-on-top is pending and rolls back on failure", async () => {
    const pending = deferred<never>();
    windowApi.setStickySettings.mockReturnValueOnce(pending.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const toggle = wrapper.get("[role='switch'][aria-label='切换始终置顶']");

    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    expect(toggle.attributes("disabled")).toBeDefined();
    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      alwaysOnTop: false,
    });

    pending.reject(new Error("native failure"));
    await flushPromises();
    expect(toggle.attributes("aria-checked")).toBe("true");
    expect(toggle.attributes("disabled")).toBeUndefined();
    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法更新始终置顶设置",
    );
    wrapper.unmount();
  });

  it("shows pending and successful copy states, then clears its timer on unmount", async () => {
    vi.useFakeTimers();
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const pending = deferred<{
      status: "copied";
      stats: { copyCount: number; lastCopiedAt: number };
    }>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const row = wrapper.get("button[data-test='sticky-slot']");

    await row.trigger("click");
    expect(row.attributes("disabled")).toBeDefined();
    expect(row.attributes("aria-label")).toContain("正在复制");
    pending.resolve({
      status: "copied",
      stats: { copyCount: 13, lastCopiedAt: 3 },
    });
    await flushPromises();

    expect(wrapper.find(".lucide-check").exists()).toBe(true);
    expect(wrapper.get("[aria-live='polite']").text()).toContain("已复制");
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires current copied feedback exactly at the 1600ms boundary", async () => {
    vi.useFakeTimers();
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();
    expect(wrapper.get(".sticky-window-status").text()).toContain("已复制");
    expect(wrapper.find(".lucide-check").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1599);
    await nextTick();
    expect(wrapper.get(".sticky-window-status").text()).toContain("已复制");
    expect(wrapper.find(".lucide-check").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.get(".sticky-window-status").text()).toBe("");
    expect(wrapper.find(".lucide-check").exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });

  it("clears an old window error when a later copy succeeds", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper
      .get("[role='switch'][aria-label='切换始终置顶']")
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法更新始终置顶设置",
    );

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    const status = wrapper.get(".sticky-window-status");
    expect(status.text()).toBe("已复制");
    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    expect(wrapper.find(".lucide-check").exists()).toBe(true);
    wrapper.unmount();
  });

  it("clears an old window error before routing a template to Quick", async () => {
    const template = { ...pinnedPrompt, body: "处理 {{主题}}" };
    promptApi.listSticky.mockResolvedValue([template]);
    windowApi.hideSticky.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[aria-label='收起便签']").trigger("click");
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain("无法收起便签");

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(windowApi.showQuick).toHaveBeenCalledWith(template.id);
    const status = wrapper.get(".sticky-window-status");
    expect(status.text()).toBe("");
    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    wrapper.unmount();
  });

  it("renders copied-with-stats-error as a polite amber warning with a Check", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    copyPromptText.mockResolvedValueOnce({
      status: "copied-with-stats-error",
      error: new Error("database busy"),
    });
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    const row = wrapper.get("button[data-test='sticky-slot']");
    const status = wrapper.get(".sticky-window-status");
    expect(row.classes()).toContain("copied");
    expect(row.classes()).toContain("warning");
    expect(wrapper.find(".lucide-check").exists()).toBe(true);
    expect(status.text()).toContain("已复制，统计更新失败");
    expect(status.classes()).toContain("warning");
    expect(status.classes()).not.toContain("error");
    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    wrapper.unmount();
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a stale %s after the same prompt id reloads with new content",
    async (outcome) => {
      vi.useFakeTimers();
      const refreshedPrompt = {
        ...pinnedPrompt,
        title: "刷新后的提示词",
        body: "刷新后的正文",
        updatedAt: pinnedPrompt.updatedAt + 1,
      };
      const pending = deferred<{
        status: "copied";
        stats: { copyCount: number; lastCopiedAt: number };
      }>();
      let promptsChanged!: () => void;
      listen.mockImplementation(async (_event, handler) => {
        promptsChanged = handler as () => void;
        return () => undefined;
      });
      promptApi.listSticky
        .mockResolvedValueOnce([pinnedPrompt])
        .mockResolvedValueOnce([refreshedPrompt]);
      copyPromptText.mockReturnValueOnce(pending.promise);
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        configurable: true,
        value: {},
      });
      const wrapper = mount(StickyWindow);
      await flushPromises();

      await wrapper.get("button[data-test='sticky-slot']").trigger("click");
      promptsChanged();
      await flushPromises();
      expect(wrapper.get(".sticky-row-title").text()).toBe(
        refreshedPrompt.title,
      );

      if (outcome === "resolve") {
        pending.resolve({
          status: "copied",
          stats: { copyCount: 13, lastCopiedAt: 3 },
        });
      } else {
        pending.reject(new Error("stale clipboard failure"));
      }
      await flushPromises();

      const row = wrapper.get("button[data-test='sticky-slot']");
      expect(row.attributes("disabled")).toBeUndefined();
      expect(wrapper.find(".lucide-check").exists()).toBe(false);
      expect(wrapper.get(".sticky-window-status").text()).toBe("");
      expect(vi.getTimerCount()).toBe(0);
      wrapper.unmount();
    },
  );

  it("reports clipboard failures as alerts and restores the copy action", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    copyPromptText.mockRejectedValueOnce(new Error("无法写入系统剪贴板"));
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const row = wrapper.get("button[data-test='sticky-slot']");

    await row.trigger("click");
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法写入系统剪贴板",
    );
    expect(row.attributes("disabled")).toBeUndefined();
    expect(row.attributes("aria-label")).toContain("无法写入系统剪贴板");
    expect(wrapper.find(".lucide-check").exists()).toBe(false);
    expect(wrapper.find(".lucide-copy").exists()).toBe(true);
    wrapper.unmount();
  });

  it("routes template rows to Quick without writing the clipboard", async () => {
    const template = { ...pinnedPrompt, body: "处理 {{主题}}" };
    promptApi.listSticky.mockResolvedValue([template]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(windowApi.showQuick).toHaveBeenCalledWith(template.id);
    expect(copyPromptText).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps settings, reorder, copy, and empty-slot actions accessibly named", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(
      wrapper.get("[data-test='sticky-menu']").attributes("aria-label"),
    ).toBe("便签设置");
    expect(wrapper.get("[data-test='sort-in-main']").text()).toContain("排序");
    expect(
      wrapper.find("[data-test='sort-in-main'] .lucide-grip-vertical").exists(),
    ).toBe(true);
    expect(
      wrapper.get("button[data-test='sticky-slot']").attributes("aria-label"),
    ).toContain(pinnedPrompt.title);
    expect(wrapper.get(".sticky-row.empty").attributes("aria-label")).toContain(
      "空位 2",
    );
    wrapper.unmount();
  });

  it("keeps the displayed density and reports an accessible error when resize fails", async () => {
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = mountSticky();
    await flushPromises();

    await wrapper.get("[data-test='sticky-menu']").trigger("click");
    document.body
      .querySelector<HTMLButtonElement>("[data-test='sticky-density-toggle']")!
      .click();
    await flushPromises();

    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(wrapper.get("[role='alert']").text()).toContain("无法调整便签尺寸");
    wrapper.unmount();
  });

  it("switches to full mode from the title icon and footer", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-test='manage-in-main']").trigger("click");
    await flushPromises();

    expect(windowApi.enterMainMode).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("suppresses repeated full-mode transitions while one is pending", async () => {
    let resolveTransition!: (value: { mode: "main" }) => void;
    windowApi.enterMainMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = mount(StickyWindow);
    const titleControl = wrapper.get("[aria-label='切换到完整模式']");
    const footerControl = wrapper.get("[data-test='manage-in-main']");

    const titleClick = titleControl.trigger("click");
    const footerClick = footerControl.trigger("click");
    await Promise.all([titleClick, footerClick]);

    expect(windowApi.enterMainMode).toHaveBeenCalledOnce();
    expect(titleControl.attributes("disabled")).toBeDefined();
    expect(footerControl.attributes("disabled")).toBeDefined();

    resolveTransition({ mode: "main" });
    await flushPromises();
    expect(titleControl.attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("renders accessible feedback when switching to full mode fails", async () => {
    windowApi.enterMainMode.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法切换到完整模式",
    );
    wrapper.unmount();
  });

  it("keeps close as the explicit zero-window action", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(windowApi.hideSticky).toHaveBeenCalledOnce();
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("handles a rejected close without opening full mode", async () => {
    windowApi.hideSticky.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain("无法收起便签");
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
