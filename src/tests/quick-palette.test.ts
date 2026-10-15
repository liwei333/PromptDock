// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyPromptText, promptApi, windowApi } = vi.hoisted(() => ({
  copyPromptText: vi.fn(),
  promptApi: { get: vi.fn(), list: vi.fn() },
  windowApi: { hideQuick: vi.fn() },
}));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));
vi.mock("@/api/commands", () => ({ promptApi, windowApi }));

import QuickPalette from "@/components/QuickPalette.vue";
import type { Prompt } from "@/types/prompt";

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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("QuickPalette", () => {
  beforeEach(() => {
    copyPromptText.mockResolvedValue({
      status: "copied",
      stats: { copyCount: 1, lastCopiedAt: 2 },
    });
    promptApi.list.mockResolvedValue({ items: [], total: 0 });
    windowApi.hideQuick.mockResolvedValue({ hidden: true });
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
