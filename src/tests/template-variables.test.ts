import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const { copyPromptText } = vi.hoisted(() => ({ copyPromptText: vi.fn() }));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));

import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";

import {
  extractTemplateVariables,
  renderTemplate,
  TemplateVariableError,
} from "@/composables/useTemplateVariables";

describe("template variables", () => {
  afterEach(() => {
    document.body.replaceChildren();
    copyPromptText.mockReset();
  });

  it("extracts Unicode variables in first-seen order and removes duplicates", () => {
    expect(
      extractTemplateVariables(
        "为 {{ 项目名称 }} 面向 {{target_user}} 编写，项目仍是 {{项目名称}}。",
      ),
    ).toEqual(["项目名称", "target_user"]);
  });

  it("inserts dollar signs, backslashes, and braces as literal text once", () => {
    const output = renderTemplate("路径={{路径}}；值={{值}}", {
      路径: String.raw`C:\\work\\$&`,
      值: "{{不会二次解析}} $` $'",
    });

    expect(output).toBe(
      "路径=" + String.raw`C:\\work\\$&` + "；值={{不会二次解析}} $` $'",
    );
  });

  it("rejects missing values instead of copying unresolved placeholders", () => {
    expect(() =>
      renderTemplate("你好 {{姓名}}，项目 {{项目}}", { 姓名: "小明" }),
    ).toThrow(new TemplateVariableError("MISSING_VALUE", "项目"));
  });

  it("rejects invalid names and more than thirty distinct variables", () => {
    expect(() => extractTemplateVariables("{{bad-name}}")).toThrowError(
      TemplateVariableError,
    );
    const body = Array.from(
      { length: 31 },
      (_, index) => `{{变量${index}}}`,
    ).join(" ");
    expect(() => extractTemplateVariables(body)).toThrow(
      new TemplateVariableError("TOO_MANY_VARIABLES"),
    );
  });

  it("keeps the presentation accessible and blocks copying incomplete fields", async () => {
    const wrapper = mount(TemplateVariablesPanel, {
      attachTo: document.body,
      props: {
        prompt: {
          id: "prompt-a",
          title: "变量模板",
          description: "",
          body: "你好 {{姓名}}，路径 {{路径}}",
          categoryId: "category-a",
          categoryName: "通用效率",
          tags: [],
          isFavorite: false,
          isPinned: false,
          pinOrder: null,
          copyCount: 0,
          lastCopiedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });

    await wrapper.get("[data-test='copy-template']").trigger("click");
    await flushPromises();
    expect(copyPromptText).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("请填写变量“姓名”");
    expect(wrapper.find('button[aria-label="关闭变量填写"] svg').exists()).toBe(
      true,
    );
  });

  it("uses unique title relationships for multiple variable panels", () => {
    const prompt = {
      id: "prompt-a",
      title: "变量模板",
      description: "",
      body: "你好 {{姓名}}",
      categoryId: "category-a",
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
    const wrapper = mount({
      components: { TemplateVariablesPanel },
      setup: () => ({ prompt }),
      template: `
        <TemplateVariablesPanel :prompt="prompt" />
        <TemplateVariablesPanel :prompt="prompt" />
      `,
    });

    const panels = wrapper.findAll(".variable-panel");
    const ids = panels.map((panel) => panel.attributes("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const [index, panel] of panels.entries()) {
      const id = ids[index];
      expect(id).toBeDefined();
      expect(panel.find(`#${CSS.escape(id!)}`).text()).toBe("变量模板");
    }
  });
});
