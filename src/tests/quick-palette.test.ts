// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { flushPromises, mount as mountVue } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { copyPromptText, listen, promptApi, windowApi } = vi.hoisted(() => ({
  copyPromptText: vi.fn(),
  listen: vi.fn(),
  promptApi: { get: vi.fn(), list: vi.fn() },
  windowApi: { hideQuick: vi.fn() },
}));

vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("@/services/clipboard", () => ({ copyPromptText }));
vi.mock("@/api/commands", () => ({ promptApi, windowApi }));

import QuickPalette from "@/components/QuickPalette.vue";
import type { Prompt } from "@/types/prompt";

const mountedWrappers = new Set<ReturnType<typeof mountVue>>();

function mount(...args: Parameters<typeof mountVue>) {
  const wrapper = mountVue(...args);
  mountedWrappers.add(wrapper);
  return wrapper;
}

const quickSource = readFileSync(
  resolve("src/components/QuickPalette.vue"),
  "utf8",
);

function item(index: number): Prompt {
  return {
    id: `p${index}`,
    title: `提示词 ${index}`,
    description: "",
    body: `正文 ${index}`,
    categoryId: "c1",
    categoryName: "通用效率",
    tags: [],
    isFavorite: false,
    isPinned: false,
    pinOrder: null,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function enableTauri(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
}

describe("QuickPalette", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listen.mockResolvedValue(() => undefined);
    copyPromptText.mockResolvedValue({
      status: "copied",
      stats: { copyCount: 1, lastCopiedAt: 2 },
    });
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    windowApi.hideQuick.mockResolvedValue({ hidden: true });
  });

  afterEach(() => {
    for (const wrapper of [...mountedWrappers].reverse()) {
      if (!wrapper.vm.$.isUnmounted) wrapper.unmount();
    }
    mountedWrappers.clear();
    document.body.replaceChildren();
    if (vi.isFakeTimers()) vi.clearAllTimers();
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("uses labelled Lucide search, copy, and template actions with valid listbox semantics", async () => {
    const prompts = [
      item(1),
      { ...item(2), title: "会议模板", body: "总结 {{主题}}" },
    ];
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });

    const search = wrapper.get("input[aria-label='搜索提示词']");
    expect(search.attributes("role")).toBe("combobox");
    expect(search.attributes("aria-controls")).toBeTruthy();
    expect(wrapper.get(".lucide-search").attributes("aria-hidden")).toBe(
      "true",
    );
    expect(wrapper.find("[role='listbox']").exists()).toBe(true);
    expect(wrapper.findAll("[role='option']")).toHaveLength(2);

    const [copyOption, templateOption] = wrapper.findAll("[role='option']");
    expect(copyOption.attributes("aria-label")).toContain("复制");
    expect(copyOption.find(".lucide-copy").exists()).toBe(true);
    expect(templateOption.attributes("aria-label")).toContain("填写变量");
    expect(templateOption.find(".lucide-braces").exists()).toBe(true);
  });

  it("does not retain legacy Unicode control glyphs in the Quick source", () => {
    for (const glyph of ["⌕", "⌁"]) {
      expect(quickSource).not.toContain(glyph);
    }
    expect(quickSource).not.toMatch(/class="quick-icon"[^>]*>\s*P\s*</);
  });

  it("shows no more than 12 candidates and wraps arrow navigation", async () => {
    const prompts = Array.from({ length: 14 }, (_, index) => item(index));
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });

    expect(wrapper.findAll("[data-test='quick-result']")).toHaveLength(12);
    const input = wrapper.get("input");
    await input.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 11");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 0");
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("focuses search initially and closes only after the selected copy resolves", async () => {
    let resolveCopy!: (value: {
      status: "copied";
      stats: { copyCount: number; lastCopiedAt: number };
    }) => void;
    copyPromptText.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCopy = resolve;
      }),
    );
    const wrapper = mount(QuickPalette, {
      attachTo: document.body,
      props: { initialPrompts: [item(1)], embedded: true },
    });
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get("input").element);
    await wrapper.get("input").trigger("keydown", { key: "Enter" });
    expect(copyPromptText).toHaveBeenCalledOnce();
    expect(wrapper.emitted("close")).toBeUndefined();

    resolveCopy({
      status: "copied",
      stats: { copyCount: 2, lastCopiedAt: 3 },
    });
    await flushPromises();

    expect(wrapper.get(".lucide-check").attributes("aria-hidden")).toBe("true");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("routes variable templates to the variable panel without copying", async () => {
    const prompt = { ...item(1), body: "为 {{产品}} 写发布说明" };
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt], embedded: true },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");

    expect(wrapper.get(".variable-panel").text()).toContain(prompt.title);
    expect(copyPromptText).not.toHaveBeenCalled();
  });

  it("filters Chinese text in the embedded main-window palette", async () => {
    const prompts = [
      item(1),
      { ...item(2), title: "季度经营复盘", body: "检查现金流" },
    ];
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });
    await wrapper.get("input").setValue("现金流");
    const results = wrapper.findAll("[data-test='quick-result']");
    expect(results).toHaveLength(1);
    expect(results[0].text()).toContain("季度经营复盘");
  });

  it("keeps only the latest remote search result when requests resolve out of order", async () => {
    promptApi.list.mockResolvedValueOnce({ items: [], total: 0 });
    const first = deferred<{ items: Prompt[]; total: number }>();
    const latest = deferred<{ items: Prompt[]; total: number }>();
    promptApi.list
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(latest.promise);
    const wrapper = mount(QuickPalette);
    await flushPromises();

    await wrapper.get("input").setValue("first");
    await wrapper.get("input").setValue("latest");
    latest.resolve({
      items: [{ ...item(2), title: "latest 最新结果" }],
      total: 1,
    });
    await flushPromises();
    expect(wrapper.get("[data-test='quick-result']").text()).toContain(
      "最新结果",
    );

    first.resolve({
      items: [{ ...item(1), title: "first 过期结果" }],
      total: 1,
    });
    await flushPromises();
    expect(wrapper.get("[data-test='quick-result']").text()).toContain(
      "最新结果",
    );
    expect(wrapper.text()).not.toContain("过期结果");
  });

  it("registers native selection before the initial list resolves and handles the event", async () => {
    enableTauri();
    const initialLoad = deferred<{ items: Prompt[]; total: number }>();
    const selected = { ...item(7), body: "为 {{项目}} 写计划" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.list.mockReturnValueOnce(initialLoad.promise);
    promptApi.get.mockResolvedValueOnce(selected);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });

    const wrapper = mount(QuickPalette);
    await flushPromises();

    expect(listen).toHaveBeenCalledWith(
      "quick-select-prompt",
      expect.any(Function),
    );
    await selectPrompt({ payload: selected.id });
    await flushPromises();
    expect(wrapper.get(".variable-panel").text()).toContain(selected.title);

    initialLoad.resolve({ items: [], total: 0 });
    await flushPromises();
    wrapper.unmount();
  });

  it("immediately disposes a listener that resolves after unmount", async () => {
    enableTauri();
    const lateListener = deferred<() => void>();
    const unlisten = vi.fn();
    listen.mockReturnValueOnce(lateListener.promise);
    const wrapper = mount(QuickPalette);
    await flushPromises();
    expect(listen).toHaveBeenCalledOnce();

    wrapper.unmount();
    lateListener.resolve(unlisten);
    await flushPromises();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("keeps only the latest native prompt selection when gets resolve out of order", async () => {
    enableTauri();
    const first = deferred<Prompt>();
    const latest = deferred<Prompt>();
    const firstPrompt = { ...item(1), body: "旧 {{主题}}" };
    const latestPrompt = { ...item(2), body: "新 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    promptApi.get
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(latest.promise);
    const wrapper = mount(QuickPalette);
    await flushPromises();

    const firstSelection = selectPrompt({ payload: firstPrompt.id });
    const latestSelection = selectPrompt({ payload: latestPrompt.id });
    latest.resolve(latestPrompt);
    await latestSelection;
    await flushPromises();
    expect(wrapper.get(".variable-panel").text()).toContain(latestPrompt.title);

    first.resolve(firstPrompt);
    await firstSelection;
    await flushPromises();
    expect(wrapper.get(".variable-panel").text()).toContain(latestPrompt.title);
    expect(wrapper.text()).not.toContain(firstPrompt.title);
    wrapper.unmount();
  });

  it("reports the current native selection failure", async () => {
    enableTauri();
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    promptApi.get.mockRejectedValueOnce("native get failed");
    const wrapper = mount(QuickPalette);
    await flushPromises();

    await selectPrompt({ payload: "missing" });
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain("native get failed");
    wrapper.unmount();
  });

  it.each([
    { key: "ArrowDown", expectedIndex: 1, outcome: "resolve" },
    { key: "ArrowDown", expectedIndex: 1, outcome: "reject" },
    { key: "ArrowUp", expectedIndex: 2, outcome: "resolve" },
    { key: "ArrowUp", expectedIndex: 2, outcome: "reject" },
  ] as const)(
    "keeps $key navigation when an older native selection settles via $outcome",
    async ({ key, expectedIndex, outcome }) => {
      enableTauri();
      const pendingSelection = deferred<Prompt>();
      const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
      let selectPrompt!: (event: { payload: string }) => Promise<void>;
      promptApi.get.mockReturnValueOnce(pendingSelection.promise);
      listen.mockImplementationOnce(async (_name, handler) => {
        selectPrompt = handler as (event: { payload: string }) => Promise<void>;
        return () => undefined;
      });
      const prompts = [item(0), item(1), item(2)];
      const wrapper = mount(QuickPalette, {
        props: { initialPrompts: prompts },
      });
      await flushPromises();

      const selection = selectPrompt({ payload: staleTemplate.id });
      await wrapper.get("input").trigger("keydown", { key });
      expect(wrapper.get("[aria-selected='true']").text()).toContain(
        prompts[expectedIndex].title,
      );

      if (outcome === "resolve") pendingSelection.resolve(staleTemplate);
      else pendingSelection.reject(new Error("stale navigation error"));
      await selection;
      await flushPromises();

      expect(wrapper.find(".variable-panel").exists()).toBe(false);
      expect(wrapper.find("[role='alert']").exists()).toBe(false);
      expect(wrapper.get("[aria-selected='true']").text()).toContain(
        prompts[expectedIndex].title,
      );
      wrapper.unmount();
    },
  );

  it.each(["resolve", "reject"] as const)(
    "keeps mouse-selected local result when an older native selection %ss",
    async (outcome) => {
      enableTauri();
      const pendingSelection = deferred<Prompt>();
      const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
      let selectPrompt!: (event: { payload: string }) => Promise<void>;
      promptApi.get.mockReturnValueOnce(pendingSelection.promise);
      listen.mockImplementationOnce(async (_name, handler) => {
        selectPrompt = handler as (event: { payload: string }) => Promise<void>;
        return () => undefined;
      });
      const prompts = [item(0), item(1), item(2)];
      const wrapper = mount(QuickPalette, {
        props: { initialPrompts: prompts },
      });
      await flushPromises();

      const selection = selectPrompt({ payload: staleTemplate.id });
      await wrapper
        .findAll("[data-test='quick-result']")[2]
        .trigger("mouseenter");
      expect(wrapper.get("[aria-selected='true']").text()).toContain(
        prompts[2].title,
      );

      if (outcome === "resolve") pendingSelection.resolve(staleTemplate);
      else pendingSelection.reject(new Error("stale hover error"));
      await selection;
      await flushPromises();

      expect(wrapper.find(".variable-panel").exists()).toBe(false);
      expect(wrapper.find("[role='alert']").exists()).toBe(false);
      expect(wrapper.get("[aria-selected='true']").text()).toContain(
        prompts[2].title,
      );
      wrapper.unmount();
    },
  );

  it.each(["resolve", "reject"] as const)(
    "preserves local pasted template input when a newer native selection %ss",
    async (outcome) => {
      enableTauri();
      const pendingSelection = deferred<Prompt>();
      const localTemplate = { ...item(1), body: "本地 {{项目}}" };
      const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
      let selectPrompt!: (event: { payload: string }) => Promise<void>;
      promptApi.get.mockReturnValueOnce(pendingSelection.promise);
      listen.mockImplementationOnce(async (_name, handler) => {
        selectPrompt = handler as (event: { payload: string }) => Promise<void>;
        return () => undefined;
      });
      const wrapper = mount(QuickPalette, {
        props: { initialPrompts: [localTemplate] },
      });
      await flushPromises();

      await wrapper.get("[data-test='quick-result']").trigger("click");
      const selection = selectPrompt({ payload: staleTemplate.id });
      const field = wrapper.get("input[placeholder='填写项目']");
      (field.element as HTMLInputElement).value = "粘贴的 PromptDock";
      await field.trigger("input", { inputType: "insertFromPaste" });
      expect(wrapper.get(".preview-block pre").text()).toContain(
        "粘贴的 PromptDock",
      );

      if (outcome === "resolve") pendingSelection.resolve(staleTemplate);
      else pendingSelection.reject(new Error("stale edit error"));
      await selection;
      await flushPromises();

      expect(wrapper.get(".variable-panel").text()).toContain(
        localTemplate.title,
      );
      expect(
        (
          wrapper.get("input[placeholder='填写项目']")
            .element as HTMLInputElement
        ).value,
      ).toBe("粘贴的 PromptDock");
      expect(wrapper.get(".preview-block pre").text()).toContain(
        "粘贴的 PromptDock",
      );
      expect(wrapper.find("[role='alert']").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it.each(["resolve", "reject"] as const)(
    "ignores a native selection that %ss after Escape closes the native palette",
    async (outcome) => {
      enableTauri();
      const pendingSelection = deferred<Prompt>();
      const staleTemplate = { ...item(8), body: "旧 {{主题}}" };
      let selectPrompt!: (event: { payload: string }) => Promise<void>;
      promptApi.get.mockReturnValueOnce(pendingSelection.promise);
      listen.mockImplementationOnce(async (_name, handler) => {
        selectPrompt = handler as (event: { payload: string }) => Promise<void>;
        return () => undefined;
      });
      const wrapper = mount(QuickPalette, {
        props: {
          initialPrompts: [item(1)],
          onClose: () => void windowApi.hideQuick(),
        },
      });
      await flushPromises();

      const selection = selectPrompt({ payload: staleTemplate.id });
      await wrapper.get("input").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(windowApi.hideQuick).toHaveBeenCalledOnce();

      if (outcome === "resolve") pendingSelection.resolve(staleTemplate);
      else pendingSelection.reject(new Error("stale native selection error"));
      await selection;
      await flushPromises();

      expect(wrapper.find(".variable-panel").exists()).toBe(false);
      expect(wrapper.find("[role='alert']").exists()).toBe(false);
      expect(wrapper.find("input[aria-label='搜索提示词']").exists()).toBe(
        true,
      );
      expect(wrapper.get("[data-test='quick-result']").text()).toContain(
        item(1).title,
      );
      expect(windowApi.hideQuick).toHaveBeenCalledOnce();
      wrapper.unmount();
    },
  );

  it("keeps a local direct-copy outcome when an older native selection resolves", async () => {
    enableTauri();
    const pendingSelection = deferred<Prompt>();
    const localPrompt = item(1);
    const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.get.mockReturnValueOnce(pendingSelection.promise);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [localPrompt] },
    });
    await flushPromises();

    const selection = selectPrompt({ payload: staleTemplate.id });
    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();
    expect(windowApi.hideQuick).toHaveBeenCalledOnce();
    expect(wrapper.emitted("copied")).toEqual([[localPrompt]]);

    pendingSelection.resolve(staleTemplate);
    await selection;
    await flushPromises();

    expect(wrapper.find(".variable-panel").exists()).toBe(false);
    expect(wrapper.get("[data-test='quick-result']").text()).toContain(
      localPrompt.title,
    );
    expect(windowApi.hideQuick).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("keeps local search intent when an older native selection resolves", async () => {
    enableTauri();
    const pendingSelection = deferred<Prompt>();
    const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.get.mockReturnValueOnce(pendingSelection.promise);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [item(1)] },
    });
    await flushPromises();

    const selection = selectPrompt({ payload: staleTemplate.id });
    await wrapper.get("input").setValue("提示词 1");
    pendingSelection.resolve(staleTemplate);
    await selection;
    await flushPromises();

    expect(wrapper.find(".variable-panel").exists()).toBe(false);
    expect(wrapper.get("input").element).toHaveProperty("value", "提示词 1");
    expect(wrapper.get("[data-test='quick-result']").text()).toContain(
      item(1).title,
    );
    wrapper.unmount();
  });

  it("keeps a local template open when an older native selection resolves", async () => {
    enableTauri();
    const pendingSelection = deferred<Prompt>();
    const localTemplate = { ...item(1), body: "本地 {{项目}}" };
    const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.get.mockReturnValueOnce(pendingSelection.promise);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [localTemplate] },
    });
    await flushPromises();

    const selection = selectPrompt({ payload: staleTemplate.id });
    await wrapper.get("[data-test='quick-result']").trigger("click");
    expect(wrapper.get(".variable-panel").text()).toContain(
      localTemplate.title,
    );

    pendingSelection.resolve(staleTemplate);
    await selection;
    await flushPromises();

    expect(wrapper.get(".variable-panel").text()).toContain(
      localTemplate.title,
    );
    expect(wrapper.text()).not.toContain(staleTemplate.title);
    wrapper.unmount();
  });

  it("keeps template cancellation after a newer pending native selection settles", async () => {
    enableTauri();
    const pendingSelection = deferred<Prompt>();
    const localTemplate = { ...item(1), body: "本地 {{项目}}" };
    const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.get.mockReturnValueOnce(pendingSelection.promise);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [localTemplate] },
    });
    await flushPromises();

    await wrapper.get("[data-test='quick-result']").trigger("click");
    const selection = selectPrompt({ payload: staleTemplate.id });
    await wrapper.get("button[aria-label='关闭变量填写']").trigger("click");
    expect(wrapper.find(".variable-panel").exists()).toBe(false);

    pendingSelection.resolve(staleTemplate);
    await selection;
    await flushPromises();

    expect(wrapper.find(".variable-panel").exists()).toBe(false);
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps template-copy completion after a newer pending native selection settles", async () => {
    enableTauri();
    const pendingSelection = deferred<Prompt>();
    const localTemplate = { ...item(1), body: "本地 {{项目}}" };
    const staleTemplate = { ...item(9), body: "旧 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    promptApi.get.mockReturnValueOnce(pendingSelection.promise);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [localTemplate] },
    });
    await flushPromises();

    await wrapper.get("[data-test='quick-result']").trigger("click");
    const selection = selectPrompt({ payload: staleTemplate.id });
    await wrapper.get("input[placeholder='填写项目']").setValue("PromptDock");
    await wrapper.get("[data-test='copy-template']").trigger("click");
    await flushPromises();
    expect(windowApi.hideQuick).toHaveBeenCalledOnce();
    expect(wrapper.emitted("copied")).toEqual([[localTemplate]]);

    pendingSelection.resolve(staleTemplate);
    await selection;
    await flushPromises();

    expect(wrapper.find(".variable-panel").exists()).toBe(false);
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    expect(windowApi.hideQuick).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("invalidates a pending direct copy when native selection opens a template", async () => {
    enableTauri();
    const pendingCopy = deferred<{
      status: "copied";
      stats: { copyCount: number; lastCopiedAt: number };
    }>();
    const template = { ...item(2), body: "新建 {{主题}}" };
    let selectPrompt!: (event: { payload: string }) => Promise<void>;
    copyPromptText.mockReturnValueOnce(pendingCopy.promise);
    promptApi.get.mockResolvedValueOnce(template);
    listen.mockImplementationOnce(async (_name, handler) => {
      selectPrompt = handler as (event: { payload: string }) => Promise<void>;
      return () => undefined;
    });
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [item(1)] },
    });
    await flushPromises();

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await selectPrompt({ payload: template.id });
    await flushPromises();
    expect(wrapper.get(".variable-panel").text()).toContain(template.title);

    pendingCopy.resolve({
      status: "copied",
      stats: { copyCount: 2, lastCopiedAt: 3 },
    });
    await flushPromises();

    expect(wrapper.get(".variable-panel").text()).toContain(template.title);
    expect(windowApi.hideQuick).not.toHaveBeenCalled();
    expect(wrapper.emitted("copied")).toBeUndefined();
    wrapper.unmount();
  });

  it("clamps keyboard selection when externally supplied results shrink", async () => {
    const prompts = Array.from({ length: 12 }, (_, index) => item(index));
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: prompts, embedded: true },
    });
    const input = wrapper.get("input");
    await input.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 11");

    await wrapper.setProps({ initialPrompts: [prompts[0]] });
    await flushPromises();

    const activeId = input.attributes("aria-activedescendant");
    expect(activeId).toBeTruthy();
    expect(wrapper.find(`#${activeId}`).exists()).toBe(true);
    expect(wrapper.get("[aria-selected='true']").text()).toContain("提示词 0");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(copyPromptText).toHaveBeenCalledWith({
      id: prompts[0].id,
      text: prompts[0].body,
    });
    wrapper.unmount();
  });

  it("clears copied state exactly at 1200ms even when the native window stays mounted", async () => {
    vi.useFakeTimers();
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [item(1)] },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();
    expect(wrapper.find(".lucide-check").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1199);
    expect(wrapper.find(".lucide-check").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find(".lucide-check").exists()).toBe(false);
    expect(wrapper.find(".lucide-copy").exists()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });

  it("keeps copied success when native hide rejects and reports a distinct warning", async () => {
    windowApi.hideQuick.mockRejectedValueOnce("hide rejected");
    const prompt = item(1);
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt] },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledOnce();
    expect(wrapper.emitted("copied")).toEqual([[prompt]]);
    expect(wrapper.find(".lucide-check").exists()).toBe(true);
    expect(wrapper.get("[role='alert']").text()).toContain(
      "已复制，但无法收起快速窗口",
    );
    expect(wrapper.get("[role='alert']").text()).not.toContain("复制失败");
    wrapper.unmount();
  });

  it("returns from a copied template and reports native hide failure without an unhandled rejection", async () => {
    const prompt = { ...item(1), body: "为 {{产品}} 写说明" };
    windowApi.hideQuick.mockRejectedValueOnce(new Error("native hide failed"));
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt] },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await wrapper.get("input[placeholder='填写产品']").setValue("PromptDock");
    await wrapper.get("[data-test='copy-template']").trigger("click");
    await flushPromises();

    expect(wrapper.find(".variable-panel").exists()).toBe(false);
    expect(wrapper.find("[data-test='quick-result']").exists()).toBe(true);
    expect(wrapper.emitted("copied")).toEqual([[prompt]]);
    expect(wrapper.get("[role='alert']").text()).toContain(
      "已复制，但无法收起快速窗口",
    );
    wrapper.unmount();
  });

  it("keeps loading and empty statuses outside an option-only busy listbox", async () => {
    const pending = deferred<{ items: Prompt[]; total: number }>();
    promptApi.list.mockReturnValueOnce(pending.promise);
    const wrapper = mount(QuickPalette);
    await flushPromises();

    const listbox = wrapper.get("[role='listbox']");
    expect(listbox.attributes("aria-busy")).toBe("true");
    expect(listbox.element.children).toHaveLength(0);
    expect(wrapper.get(".quick-empty[role='status']").text()).toContain(
      "正在检索",
    );
    expect(listbox.find("[role='status']").exists()).toBe(false);

    pending.resolve({ items: [], total: 0 });
    await flushPromises();
    expect(listbox.attributes("aria-busy")).toBe("false");
    expect(wrapper.get(".quick-empty[role='status']").text()).toContain(
      "没有匹配",
    );
    expect(listbox.element.children).toHaveLength(0);
    wrapper.unmount();
  });

  it("hides the native Quick window only after a successful copy", async () => {
    const prompt = item(1);
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt] },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: prompt.id,
      text: prompt.body,
    });
    expect(windowApi.hideQuick).toHaveBeenCalledOnce();
    expect(wrapper.emitted("copied")).toEqual([[prompt]]);
  });

  it("keeps Quick open and reports clipboard failures", async () => {
    copyPromptText.mockRejectedValueOnce(new Error("无法写入系统剪贴板"));
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [item(1)] },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[role='alert']").text()).toContain(
      "无法写入系统剪贴板",
    );
    expect(windowApi.hideQuick).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("copies an unrecognized variable placeholder as original text", async () => {
    const prompt = {
      ...item(1),
      body: "分析基准日：{{分析日期，默认最新可获取交易日}}",
    };
    const wrapper = mount(QuickPalette, {
      props: { initialPrompts: [prompt], embedded: true },
    });

    await wrapper.get("[data-test='quick-result']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenCalledWith({
      id: prompt.id,
      text: prompt.body,
    });
    expect(wrapper.emitted("copied")).toEqual([[prompt]]);
  });
});
