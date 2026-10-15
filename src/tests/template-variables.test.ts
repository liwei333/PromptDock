import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const { copyPromptText } = vi.hoisted(() => ({ copyPromptText: vi.fn() }));

vi.mock("@/services/clipboard", () => ({ copyPromptText }));

import TemplateVariablesPanel from "@/components/TemplateVariablesPanel.vue";

import {
  extractTemplateVariables,
  renderTemplate,
  TemplateVariableError,
} from "@/composables/useTemplateVariables";
import type { Prompt } from "@/types/prompt";

const wrappers: VueWrapper[] = [];

function track<T extends VueWrapper>(wrapper: T): T {
  wrappers.push(wrapper);
  return wrapper;
}

function makePrompt(id: string, body: string, updatedAt = 1): Prompt {
  return {
    id,
    title: `模板 ${id}`,
    description: "",
    body,
    categoryId: "category-a",
    categoryName: "通用效率",
    tags: [],
    isFavorite: false,
    isPinned: false,
    pinOrder: null,
    copyCount: 0,
    lastCopiedAt: null,
    createdAt: 1,
    updatedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function templateState(wrapper: VueWrapper) {
  return (
    wrapper.vm.$ as unknown as {
      setupState: { copying: boolean };
    }
  ).setupState;
}

describe("template variables", () => {
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      if (wrapper.exists()) wrapper.unmount();
    }
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
    const wrapper = track(
      mount(TemplateVariablesPanel, {
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
      }),
    );

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
    const wrapper = track(
      mount({
        components: { TemplateVariablesPanel },
        setup: () => ({ prompt }),
        template: `
        <TemplateVariablesPanel :prompt="prompt" />
        <TemplateVariablesPanel :prompt="prompt" />
      `,
      }),
    );

    const panels = wrapper.findAll(".variable-panel");
    const ids = panels.map((panel) => panel.attributes("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const [index, panel] of panels.entries()) {
      const id = ids[index];
      expect(id).toBeDefined();
      expect(panel.find(`#${CSS.escape(id!)}`).text()).toBe("变量模板");
    }
  });

  it("clears values and preview state when the prompt identity changes", async () => {
    const wrapper = track(
      mount(TemplateVariablesPanel, {
        props: { prompt: makePrompt("a", "A {{姓名}}") },
      }),
    );
    await wrapper.get('input[placeholder="填写姓名"]').setValue("旧值");
    expect(wrapper.get(".preview-block pre").text()).toContain("A 旧值");

    await wrapper.setProps({
      prompt: makePrompt("b", "B {{姓名}}", 2),
    });
    await flushPromises();

    expect(
      wrapper.get<HTMLInputElement>('input[placeholder="填写姓名"]').element
        .value,
    ).toBe("");
    expect(wrapper.get(".preview-block pre").text()).toBe("B {{姓名}}");
    expect(wrapper.text()).not.toContain("旧值");
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a stale copy %s after switching prompts",
    async (outcome) => {
      const pending = deferred<unknown>();
      copyPromptText.mockReturnValueOnce(pending.promise);
      const wrapper = track(
        mount(TemplateVariablesPanel, {
          props: { prompt: makePrompt("a", "A {{姓名}}") },
        }),
      );
      await wrapper.get('input[placeholder="填写姓名"]').setValue("旧值");
      await wrapper.get("[data-test='copy-template']").trigger("click");

      await wrapper.setProps({
        prompt: makePrompt("b", "B {{姓名}}", 2),
      });
      await flushPromises();
      expect(
        wrapper.get("[data-test='copy-template']").attributes("aria-busy"),
      ).toBeUndefined();

      if (outcome === "resolve") pending.resolve(undefined);
      else pending.reject(new Error("旧请求失败"));
      await flushPromises();

      expect(wrapper.emitted("copied")).toBeUndefined();
      expect(wrapper.text()).not.toContain("旧请求失败");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );

  it("allows the new prompt to copy while the old prompt request is pending", async () => {
    const pending = deferred<unknown>();
    copyPromptText
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(undefined);
    const wrapper = track(
      mount(TemplateVariablesPanel, {
        props: { prompt: makePrompt("a", "A {{姓名}}") },
      }),
    );
    await wrapper.get('input[placeholder="填写姓名"]').setValue("旧值");
    await wrapper.get("[data-test='copy-template']").trigger("click");
    await wrapper.setProps({ prompt: makePrompt("b", "B {{姓名}}", 2) });
    await wrapper.get('input[placeholder="填写姓名"]').setValue("新值");
    await wrapper.get("[data-test='copy-template']").trigger("click");
    await flushPromises();

    expect(copyPromptText).toHaveBeenLastCalledWith({
      id: "b",
      text: "B 新值",
    });
    expect(wrapper.emitted("copied")).toHaveLength(1);
    pending.resolve(undefined);
    await flushPromises();
    expect(wrapper.emitted("copied")).toHaveLength(1);
  });

  it("does not emit after a pending copy resolves following unmount", async () => {
    const pending = deferred<unknown>();
    copyPromptText.mockReturnValueOnce(pending.promise);
    const wrapper = track(
      mount(TemplateVariablesPanel, {
        props: { prompt: makePrompt("a", "A {{姓名}}") },
      }),
    );
    await wrapper.get('input[placeholder="填写姓名"]').setValue("旧值");
    await wrapper.get("[data-test='copy-template']").trigger("click");
    expect(templateState(wrapper).copying).toBe(true);
    wrapper.unmount();
    pending.resolve(undefined);
    await flushPromises();

    expect(wrapper.emitted("copied")).toBeUndefined();
    expect(templateState(wrapper).copying).toBe(true);
  });
});
