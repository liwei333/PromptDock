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

function enableTauri(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
}

const defaultStickySettings = {
  visible: true,
  alwaysOnTop: true,
  x: 120,
  y: 80,
  monitorName: "Built-in Retina Display",
  scaleFactor: 2,
  density: "comfortable" as const,
};

describe("StickyWindow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listen.mockResolvedValue(() => undefined);
    promptApi.listSticky.mockResolvedValue([]);
    windowApi.enterMainMode.mockResolvedValue({ mode: "main" });
    windowApi.hideSticky.mockResolvedValue({ hidden: true });
    windowApi.showQuick.mockResolvedValue({ shown: true });
    windowApi.getStickySettings.mockResolvedValue(defaultStickySettings);
    windowApi.setStickySettings.mockResolvedValue(defaultStickySettings);
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

  it("registers prompt updates before initial prompts and settings resolve", async () => {
    enableTauri();
    const prompts = deferred<Prompt[]>();
    const settings = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
      density: "comfortable";
    }>();
    promptApi.listSticky.mockReturnValueOnce(prompts.promise);
    windowApi.getStickySettings.mockReturnValueOnce(settings.promise);

    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(listen).toHaveBeenCalledWith(
      "prompts-changed",
      expect.any(Function),
    );
    expect(windowApi.getStickySettings).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("immediately disposes a prompt listener that resolves after unmount", async () => {
    enableTauri();
    const lateListener = deferred<() => void>();
    const unlisten = vi.fn();
    listen.mockReturnValueOnce(lateListener.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    expect(listen).toHaveBeenCalledOnce();

    wrapper.unmount();
    lateListener.resolve(unlisten);
    await flushPromises();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("keeps only the latest prompts-changed load when requests resolve out of order", async () => {
    enableTauri();
    let promptsChanged!: () => void;
    listen.mockImplementationOnce(async (_name, handler) => {
      promptsChanged = handler as () => void;
      return () => undefined;
    });
    const older = deferred<Prompt[]>();
    const latest = deferred<Prompt[]>();
    const oldPrompt = { ...pinnedPromptAt(1), title: "过期结果" };
    const latestPrompt = { ...pinnedPromptAt(2), title: "最新结果" };
    promptApi.listSticky
      .mockResolvedValueOnce([pinnedPrompt])
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    promptsChanged();
    promptsChanged();
    latest.resolve([latestPrompt]);
    await flushPromises();
    expect(wrapper.get(".sticky-row-title").text()).toBe(latestPrompt.title);

    older.resolve([oldPrompt]);
    await flushPromises();
    expect(wrapper.get(".sticky-row-title").text()).toBe(latestPrompt.title);
    expect(wrapper.text()).not.toContain(oldPrompt.title);
    wrapper.unmount();
  });

  it("reports an initial sticky prompt load failure instead of presenting an empty list", async () => {
    promptApi.listSticky.mockRejectedValueOnce("database unavailable");
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法加载便签提示词",
    );
    expect(wrapper.get(".sticky-list").attributes("aria-busy")).toBe("false");
    wrapper.unmount();
  });

  it("reports prompt-listener initialization failures accessibly", async () => {
    enableTauri();
    listen.mockRejectedValueOnce("listen rejected");
    const wrapper = mount(StickyWindow);
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain("无法监听便签更新");
    wrapper.unmount();
  });

  it("keeps native settings controls disabled after initialization fails", async () => {
    enableTauri();
    windowApi.getStickySettings.mockRejectedValueOnce(
      new Error("settings rejected"),
    );
    const wrapper = mountSticky();
    await flushPromises();

    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");
    const alwaysOnTopToggle = wrapper.get(
      "[role='switch'][aria-label='切换始终置顶']",
    );
    expect(densityToggle().attributes("disabled")).toBeDefined();
    expect(alwaysOnTopToggle.attributes("disabled")).toBeDefined();
    await densityToggle().trigger("click");
    await alwaysOnTopToggle.trigger("click");
    expect(windowApi.setStickySettings).not.toHaveBeenCalled();
    expect(wrapper.get("[role='alert']").text()).toContain("无法读取便签设置");
    wrapper.unmount();
  });

  it("keeps a settings failure announced after prompts reload successfully", async () => {
    enableTauri();
    let promptsChanged!: () => void;
    listen.mockImplementationOnce(async (_name, handler) => {
      promptsChanged = handler as () => void;
      return () => undefined;
    });
    windowApi.getStickySettings.mockRejectedValueOnce(
      new Error("settings rejected"),
    );
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = wrapper.get<HTMLButtonElement>(
      "[data-test='sticky-density-toggle']",
    );

    expect(wrapper.get("[role='alert']").text()).toBe("无法读取便签设置");
    expect(densityToggle.attributes("disabled")).toBeDefined();

    promptsChanged();
    await flushPromises();

    expect(promptApi.listSticky).toHaveBeenCalledTimes(2);
    expect(wrapper.get("[role='alert']").text()).toBe("无法读取便签设置");
    expect(densityToggle.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("disables only native settings controls while initialization is pending", async () => {
    enableTauri();
    const settings = deferred<typeof defaultStickySettings>();
    windowApi.getStickySettings.mockReturnValueOnce(settings.promise);
    const wrapper = mountSticky();
    await flushPromises();

    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");
    const alwaysOnTopToggle = wrapper.get(
      "[role='switch'][aria-label='切换始终置顶']",
    );
    expect(densityToggle().attributes("disabled")).toBeDefined();
    expect(alwaysOnTopToggle.attributes("disabled")).toBeDefined();
    expect(
      wrapper.get("[data-test='enter-main-mode']").attributes("disabled"),
    ).toBeUndefined();
    expect(
      wrapper.get("button[aria-label='收起便签']").attributes("disabled"),
    ).toBeUndefined();

    await densityToggle().trigger("click");
    await alwaysOnTopToggle.trigger("click");
    expect(windowApi.setStickySettings).not.toHaveBeenCalled();

    settings.resolve(defaultStickySettings);
    await flushPromises();
    expect(alwaysOnTopToggle.attributes("disabled")).toBeUndefined();
    expect(densityToggle().attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("toggles directly between comfortable and compact density", async () => {
    enableTauri();
    windowApi.setStickySettings
      .mockResolvedValueOnce({ ...defaultStickySettings, density: "compact" })
      .mockResolvedValueOnce(defaultStickySettings);
    const wrapper = mountSticky();
    await flushPromises();

    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");
    expect(densityToggle().attributes("aria-label")).toBe("切换到精简模式");
    expect(densityToggle().find(".lucide-shrink").exists()).toBe(true);
    await densityToggle().trigger("click");
    await flushPromises();
    expect(windowApi.setStickySettings).toHaveBeenLastCalledWith({
      density: "compact",
    });
    expect(densityToggle().attributes("aria-label")).toBe("切换到舒适模式");
    expect(densityToggle().find(".lucide-expand").exists()).toBe(true);

    await densityToggle().trigger("click");
    await flushPromises();
    expect(windowApi.setStickySettings).toHaveBeenLastCalledWith({
      density: "comfortable",
    });
    wrapper.unmount();
  });

  it("disables and marks density busy while one resize is pending", async () => {
    enableTauri();
    const mutation = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
      density: "compact";
    }>();
    windowApi.setStickySettings.mockReturnValueOnce(mutation.promise);
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    await densityToggle().trigger("click");
    await densityToggle().trigger("click");
    expect(densityToggle().attributes("disabled")).toBeDefined();
    expect(densityToggle().attributes("aria-busy")).toBe("true");
    expect(windowApi.setStickySettings).toHaveBeenCalledOnce();

    mutation.resolve({ ...defaultStickySettings, density: "compact" });
    await flushPromises();
    expect(densityToggle().attributes("disabled")).toBeUndefined();
    expect(densityToggle().attributes("aria-busy")).toBeUndefined();
    wrapper.unmount();
  });

  it("keeps comfortable density and reports resize failures accessibly", async () => {
    enableTauri();
    windowApi.setStickySettings.mockRejectedValueOnce(
      new Error("native failure"),
    );
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    await densityToggle().trigger("click");
    await flushPromises();

    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(densityToggle().attributes("aria-busy")).toBeUndefined();
    expect(densityToggle().attributes("disabled")).toBeUndefined();
    expect(wrapper.get("[role='alert']").text()).toContain("无法调整便签尺寸");
    wrapper.unmount();
  });

  it("uses the backend-returned density as the final UI truth", async () => {
    enableTauri();
    windowApi.setStickySettings.mockResolvedValueOnce(defaultStickySettings);
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    await densityToggle().trigger("click");
    await flushPromises();

    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      density: "compact",
    });
    expect(wrapper.get(".sticky-window").classes()).toContain("comfortable");
    expect(densityToggle().attributes("aria-label")).toBe("切换到精简模式");
    wrapper.unmount();
  });

  it("ignores a native settings response that arrives after unmount", async () => {
    enableTauri();
    const settings = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
      density: "compact";
    }>();
    windowApi.getStickySettings.mockReturnValueOnce(settings.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const setupState = (
      wrapper.vm.$ as unknown as {
        setupState: {
          alwaysOnTop: boolean;
          density: "comfortable" | "compact";
        };
      }
    ).setupState;
    expect(setupState.alwaysOnTop).toBe(true);
    expect(setupState.density).toBe("comfortable");

    wrapper.unmount();
    settings.resolve({
      visible: true,
      alwaysOnTop: false,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "compact",
    });
    await flushPromises();

    expect(setupState.alwaysOnTop).toBe(true);
    expect(setupState.density).toBe("comfortable");
  });

  it("does not apply an always-on-top mutation after unmount", async () => {
    enableTauri();
    const mutation = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
      density: "comfortable";
    }>();
    windowApi.setStickySettings.mockReturnValueOnce(mutation.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const setupState = (
      wrapper.vm.$ as unknown as {
        setupState: { alwaysOnTop: boolean };
      }
    ).setupState;
    const toggle = wrapper.get("[role='switch'][aria-label='切换始终置顶']");

    expect(toggle.attributes("disabled")).toBeUndefined();
    await toggle.trigger("click");
    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      alwaysOnTop: false,
    });
    wrapper.unmount();
    mutation.resolve({
      visible: true,
      alwaysOnTop: false,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
      density: "comfortable",
    });
    await flushPromises();

    expect(setupState.alwaysOnTop).toBe(true);
  });

  it("does not apply a successful density mutation after unmount", async () => {
    enableTauri();
    const mutation = deferred<{
      visible: boolean;
      alwaysOnTop: boolean;
      x: number;
      y: number;
      monitorName: string;
      scaleFactor: number;
      density: "compact";
    }>();
    windowApi.setStickySettings.mockReturnValueOnce(mutation.promise);
    const wrapper = mountSticky();
    await flushPromises();
    const setupState = (
      wrapper.vm.$ as unknown as {
        setupState: { density: "comfortable" | "compact" };
      }
    ).setupState;
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");
    await densityToggle().trigger("click");
    await nextTick();
    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      density: "compact",
    });

    wrapper.unmount();
    mutation.resolve({ ...defaultStickySettings, density: "compact" });
    await flushPromises();

    expect(setupState.density).toBe("comfortable");
  });

  it("does not report a rejected density mutation after unmount", async () => {
    enableTauri();
    const mutation = deferred<never>();
    windowApi.setStickySettings.mockReturnValueOnce(mutation.promise);
    const wrapper = mountSticky();
    await flushPromises();
    const setupState = (
      wrapper.vm.$ as unknown as {
        setupState: {
          density: "comfortable" | "compact";
          windowError: string;
        };
      }
    ).setupState;
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    expect(setupState.windowError).toBe("");
    await densityToggle().trigger("click");
    await nextTick();
    expect(windowApi.setStickySettings).toHaveBeenCalledWith({
      density: "compact",
    });

    wrapper.unmount();
    mutation.reject(new Error("late native failure"));
    await flushPromises();

    expect(setupState.density).toBe("comfortable");
    expect(setupState.windowError).toBe("");
  });

  it("keeps target labels and tooltips synchronized in both densities", async () => {
    enableTauri();
    windowApi.setStickySettings.mockResolvedValueOnce({
      ...defaultStickySettings,
      density: "compact",
    });
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    for (const label of ["切换到精简模式", "切换到完整模式", "收起便签"]) {
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

    await densityToggle().trigger("click");
    await flushPromises();
    expect(densityToggle().attributes("aria-label")).toBe("切换到舒适模式");
    await densityToggle().trigger("focus");
    await nextTick();
    expect(
      document.body.querySelector<HTMLElement>(".pd-tooltip-content")
        ?.textContent,
    ).toContain("切换到舒适模式");

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
    expect(windowApi.enterMainMode).toHaveBeenCalledWith(undefined);
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
    enableTauri();
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.setStickySettings.mockResolvedValueOnce({
      ...defaultStickySettings,
      density: "compact",
    });
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    await densityToggle().trigger("click");
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
    enableTauri();
    promptApi.listSticky.mockResolvedValue(fivePinnedPrompts);
    windowApi.setStickySettings.mockResolvedValueOnce({
      ...defaultStickySettings,
      density: "compact",
    });
    const wrapper = mountSticky();
    await flushPromises();
    const densityToggle = () =>
      wrapper.get<HTMLButtonElement>("[data-test='sticky-density-toggle']");

    await densityToggle().trigger("click");
    await flushPromises();

    expect(
      wrapper.findAll(".sticky-row-title").map((row) => row.text()),
    ).toEqual(fivePinnedPrompts.map((prompt) => prompt.title));
    expect(wrapper.findAll(".sticky-description")).toHaveLength(0);
    expect(wrapper.get(".sticky-footer").text()).toContain("排序");
    expect(wrapper.get(".sticky-footer").text()).toContain("始终置顶");
    expect(wrapper.get(".sticky-footer").text()).not.toContain("管理");
    wrapper.unmount();
  });

  it("removes the old settings dialog and duplicate management controls", async () => {
    enableTauri();
    const wrapper = mountSticky();
    await flushPromises();

    expect(wrapper.find("[data-test='sticky-menu']").exists()).toBe(false);
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    expect(wrapper.find("[data-test='manage-in-main']").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("打开完整窗口");
    expect(stickySource).not.toContain("sticky-settings-dialog");
    expect(stickySource).not.toContain("sticky-setting-row");
    expect(globalCss).not.toContain(".sticky-settings-dialog");
    expect(globalCss).not.toContain(".sticky-setting-row");
    wrapper.unmount();
  });

  it("uses a disabled role switch while always-on-top is pending and rolls back on failure", async () => {
    enableTauri();
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

  it("temporarily prioritizes a clipboard failure over a persistent settings failure", async () => {
    vi.useFakeTimers();
    enableTauri();
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    windowApi.getStickySettings.mockRejectedValueOnce(
      new Error("settings rejected"),
    );
    copyPromptText.mockRejectedValueOnce(new Error("无法写入系统剪贴板"));
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const densityToggle = wrapper.get<HTMLButtonElement>(
      "[data-test='sticky-density-toggle']",
    );
    const status = wrapper.get(".sticky-window-status");

    expect(status.text()).toBe("无法读取便签设置");
    expect(densityToggle.attributes("disabled")).toBeDefined();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(status.text()).toBe("无法写入系统剪贴板");
    expect(status.classes()).toContain("error");
    expect(status.attributes("role")).toBe("alert");
    expect(status.attributes("aria-live")).toBe("assertive");
    expect(densityToggle.attributes("disabled")).toBeDefined();

    await vi.advanceTimersByTimeAsync(1600);
    await nextTick();
    expect(status.text()).toBe("无法读取便签设置");
    expect(status.classes()).toContain("error");
    expect(status.attributes("role")).toBe("alert");
    expect(status.attributes("aria-live")).toBe("assertive");
    expect(densityToggle.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("clears an old window error when a later copy succeeds", async () => {
    enableTauri();
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

  it("reports a failed template route and restores the row action", async () => {
    const template = { ...pinnedPrompt, body: "处理 {{主题}}" };
    promptApi.listSticky.mockResolvedValue([template]);
    windowApi.showQuick.mockRejectedValueOnce("native route failed");
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法打开变量填写窗口",
    );
    expect(
      wrapper.get("button[data-test='sticky-slot']").attributes("disabled"),
    ).toBeUndefined();
    wrapper.unmount();
  });

  it("suppresses repeated template routes while showQuick is pending", async () => {
    const template = { ...pinnedPrompt, body: "处理 {{主题}}" };
    const pending = deferred<{ shown: boolean }>();
    promptApi.listSticky.mockResolvedValue([template]);
    windowApi.showQuick.mockReturnValueOnce(pending.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();
    const row = wrapper.get("button[data-test='sticky-slot']");

    await row.trigger("click");
    await row.trigger("click");

    expect(windowApi.showQuick).toHaveBeenCalledOnce();
    expect(row.attributes("disabled")).toBeDefined();
    pending.resolve({ shown: true });
    await flushPromises();
    expect(row.attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("ignores a stale template route rejection after prompt identity changes", async () => {
    enableTauri();
    const template = { ...pinnedPrompt, body: "处理 {{主题}}" };
    const refreshed = {
      ...template,
      title: "刷新后的模板",
      body: "处理 {{项目}}",
      updatedAt: template.updatedAt + 1,
    };
    const route = deferred<{ shown: boolean }>();
    let promptsChanged!: () => void;
    listen.mockImplementationOnce(async (_name, handler) => {
      promptsChanged = handler as () => void;
      return () => undefined;
    });
    promptApi.listSticky
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([refreshed]);
    windowApi.showQuick.mockReturnValueOnce(route.promise);
    const wrapper = mount(StickyWindow);
    await flushPromises();

    await wrapper.get("button[data-test='sticky-slot']").trigger("click");
    promptsChanged();
    await flushPromises();
    expect(wrapper.get(".sticky-row-title").text()).toContain(refreshed.title);
    expect(
      wrapper.get("button[data-test='sticky-slot']").attributes("disabled"),
    ).toBeUndefined();

    route.reject(new Error("stale route failed"));
    await flushPromises();
    expect(wrapper.get(".sticky-window-status").text()).toBe("");
    wrapper.unmount();
  });

  it("keeps density, reorder, copy, and empty-slot actions accessibly named", async () => {
    enableTauri();
    promptApi.listSticky.mockResolvedValue([pinnedPrompt]);
    const wrapper = mountSticky();
    await flushPromises();

    expect(
      wrapper
        .get("[data-test='sticky-density-toggle']")
        .attributes("aria-label"),
    ).toBe("切换到精简模式");
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

  it("routes the title and sort controls with their distinct intents", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-test='sort-in-main']").trigger("click");
    await flushPromises();

    expect(windowApi.enterMainMode).toHaveBeenCalledTimes(2);
    expect(windowApi.enterMainMode).toHaveBeenNthCalledWith(1, undefined);
    expect(windowApi.enterMainMode).toHaveBeenNthCalledWith(2, "manage-sticky");
    wrapper.unmount();
  });

  it("shares one pending guard between full-mode and sort transitions", async () => {
    let resolveTransition!: (value: { mode: "main" }) => void;
    windowApi.enterMainMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = mount(StickyWindow);
    const titleControl = wrapper.get("[aria-label='切换到完整模式']");
    const sortControl = wrapper.get("[data-test='sort-in-main']");

    const titleClick = titleControl.trigger("click");
    const sortClick = sortControl.trigger("click");
    await Promise.all([titleClick, sortClick]);

    expect(windowApi.enterMainMode).toHaveBeenCalledOnce();
    expect(windowApi.enterMainMode).toHaveBeenCalledWith(undefined);
    expect(titleControl.attributes("disabled")).toBeDefined();
    expect(sortControl.attributes("disabled")).toBeDefined();

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

  it("renders intent-specific feedback when opening Sort fails", async () => {
    windowApi.enterMainMode.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[data-test='sort-in-main']").trigger("click");
    await flushPromises();

    expect(windowApi.enterMainMode).toHaveBeenCalledWith("manage-sticky");
    expect(wrapper.get("[role='alert']").text()).toBe("无法打开置顶排序");
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
