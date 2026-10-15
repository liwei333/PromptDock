// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PromptCard from "@/components/PromptCard.vue";
import PromptDetailDrawer from "@/components/PromptDetailDrawer.vue";
import type { Prompt } from "@/types/prompt";

const globalCss = readFileSync(resolve("src/styles/global.css"), "utf8");

const prompt: Prompt = {
  id: "p1",
  title: "代码审查",
  description: "审查当前变更",
  body: "请审查全部代码",
  categoryId: "c1",
  categoryName: "技术研发",
  tags: ["质量"],
  isFavorite: false,
  isPinned: false,
  pinOrder: null,
  copyCount: 2,
  lastCopiedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("PromptCard", () => {
  it("separates card selection from the copy action", async () => {
    const wrapper = mount(PromptCard, { props: { prompt } });

    await wrapper.get("[data-test='copy']").trigger("click");
    expect(wrapper.emitted("copy")).toEqual([[prompt]]);
    expect(wrapper.emitted("select")).toBeUndefined();

    await wrapper.get("article").trigger("click");
    expect(wrapper.emitted("select")).toEqual([[prompt]]);
  });

  it("uses labelled SVG controls while preserving independent card actions", async () => {
    const wrapper = mount(PromptCard, { props: { prompt } });

    const favorite = wrapper.get('button[aria-label="收藏"]');
    const pin = wrapper.get('button[aria-label="加入便签"]');
    const copy = wrapper.get("[data-test='copy']");

    expect(favorite.find("svg").exists()).toBe(true);
    expect(pin.find("svg").exists()).toBe(true);
    expect(copy.find("svg").exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/[☆★!{}]/u);

    await favorite.trigger("click");
    await pin.trigger("click");
    await copy.trigger("click");
    await favorite.trigger("keydown", { key: "Enter" });
    await pin.trigger("keydown", { key: "Enter" });
    await copy.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("favorite")).toEqual([[prompt]]);
    expect(wrapper.emitted("pin")).toEqual([[prompt]]);
    expect(wrapper.emitted("copy")).toEqual([[prompt]]);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("renders template status as a named Lucide indicator", () => {
    const wrapper = mount(PromptCard, {
      props: {
        prompt: { ...prompt, body: "请分析 {{主题}}" },
      },
    });

    const templateState = wrapper.get("[data-test='template-state']");
    expect(templateState.attributes("role")).toBe("img");
    expect(templateState.attributes("aria-label")).toBe("变量模板");
    expect(templateState.find("svg").exists()).toBe(true);
    expect(templateState.text()).toBe("");
  });

  it("keeps the legacy detail drawer controls labelled and plain-text", async () => {
    const drawerPrompt = {
      ...prompt,
      body: "<strong>只作为文本</strong>",
    };
    const wrapper = mount(PromptDetailDrawer, {
      props: { prompt: drawerPrompt },
    });

    const close = wrapper.get('button[aria-label="关闭详情"]');
    const edit = wrapper.get("[data-test='drawer-edit']");
    const copy = wrapper.get("[data-test='drawer-copy']");

    expect(close.find("svg").exists()).toBe(true);
    expect(edit.find("svg").exists()).toBe(true);
    expect(copy.find("svg").exists()).toBe(true);
    expect(wrapper.find("strong strong").exists()).toBe(false);
    expect(wrapper.text()).toContain("<strong>只作为文本</strong>");
    expect(wrapper.text()).not.toContain("×");

    await close.trigger("click");
    await edit.trigger("click");
    await copy.trigger("click");

    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(wrapper.emitted("edit")).toEqual([[drawerPrompt]]);
    expect(wrapper.emitted("copy")).toEqual([[drawerPrompt]]);
  });

  it("defines a single-row 1024px workbench contract and viewport-bounded portals", () => {
    expect(globalCss).toMatch(/@media \(max-width: 1100px\)/);
    expect(globalCss).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.workbench-filters\s*\{[^}]*flex-wrap:\s*nowrap/s,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.pd-select-trigger\s*\{[^}]*padding:/s,
    );
    expect(globalCss).toMatch(
      /\.pd-select-content\s*\{[^}]*max-width:\s*min\(\s*var\(--reka-select-content-available-width/s,
    );
    expect(globalCss).toMatch(
      /\.pd-dialog-content\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/s,
    );
  });
});
