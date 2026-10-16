import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { confirmDialog, promptApi } = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  promptApi: {
    reorderSticky: vi.fn(),
    setPinned: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmDialog }));
vi.mock("@/api/commands", () => ({ promptApi }));

import PromptEditorDialog from "@/components/PromptEditorDialog.vue";
import StickyManagerDialog from "@/components/StickyManagerDialog.vue";
import type { Category, Prompt } from "@/types/prompt";

const categories: Category[] = [
  {
    id: "category-a",
    name: "通用效率",
    icon: "folder",
    color: "#2469f6",
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 1,
  },
  {
    id: "category-b",
    name: "商业分析",
    icon: "folder",
    color: "#2fb79f",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 1,
  },
];

const prompt: Prompt = {
  id: "prompt-a",
  title: "代码审查",
  description: "审查改动",
  body: "检查这段代码",
  categoryId: "category-a",
  categoryName: "通用效率",
  tags: ["开发"],
  isFavorite: false,
  isPinned: true,
  pinOrder: 0,
  copyCount: 0,
  lastCopiedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const secondPrompt: Prompt = {
  ...prompt,
  id: "prompt-b",
  title: "商业分析",
  description: "分析说明",
  body: "分析 {{公司}}",
  categoryId: "category-b",
  categoryName: "商业分析",
  tags: ["商业", "分析"],
  updatedAt: 2,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const wrappers: VueWrapper[] = [];

function track<T extends VueWrapper>(wrapper: T): T {
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

beforeEach(() => {
  confirmDialog.mockReset();
  promptApi.reorderSticky.mockReset();
  promptApi.reorderSticky.mockResolvedValue(undefined);
  promptApi.setPinned.mockReset();
  promptApi.setPinned.mockResolvedValue(undefined);
});

async function settle(): Promise<void> {
  await flushPromises();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await flushPromises();
}

async function dirtyEditor(): Promise<VueWrapper> {
  const wrapper = track(
    mount(PromptEditorDialog, {
      attachTo: document.body,
      props: { prompt, categories },
      global: { stubs: { Teleport: false } },
    }),
  );
  await settle();
  const title = document.body.querySelector<HTMLInputElement>(
    "[data-test='prompt-title']",
  )!;
  title.value = "代码审查（修订）";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  return wrapper;
}

describe("PromptEditorDialog", () => {
  it("uses a named, focused dialog and shared category select", async () => {
    track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt, categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe("编辑提示词");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.querySelector("select")).toBeNull();
    expect(
      dialog.querySelector('button[role="combobox"][aria-label="分类"]'),
    ).not.toBeNull();
  });

  it("preserves the save payload while updating category through the shared select", async () => {
    const wrapper = track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt, categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    document.body
      .querySelector<HTMLButtonElement>(
        'button[role="combobox"][aria-label="分类"]',
      )!
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        }),
      );
    await settle();
    const option = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((candidate) => candidate.textContent?.trim() === "商业分析");
    expect(option).toBeDefined();
    option!.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );
    await settle();
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    await settle();

    expect(wrapper.emitted("save")).toEqual([
      [
        {
          title: "代码审查",
          description: "审查改动",
          body: "检查这段代码",
          categoryId: "category-b",
          tags: ["开发"],
          isFavorite: false,
          isPinned: true,
        },
        "prompt-a",
      ],
    ]);
  });

  it("keeps an eleventh visible tag in dirty state and blocks silent truncation", async () => {
    const tenTags = Array.from(
      { length: 10 },
      (_, index) => `标签${index + 1}`,
    );
    confirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt: { ...prompt, tags: tenTags }, categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const tags = document.body.querySelector<HTMLInputElement>(
      "[data-test='prompt-tags']",
    )!;
    const rawTags = `${tenTags.join("，")}，第11个标签`;
    tags.value = rawTags;
    tags.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(tags.value).toBe(rawTags);
    expect(
      document.body.querySelector('[role="alert"]')?.textContent,
    ).toContain("标签不能超过 10 个");
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    expect(wrapper.emitted("save")).toBeUndefined();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("close")).toBeUndefined();
    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="关闭编辑器"]')!
      .click();
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("saves all entered tags when the count stays within the limit", async () => {
    const wrapper = track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt, categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const tags = document.body.querySelector<HTMLInputElement>(
      "[data-test='prompt-tags']",
    )!;
    tags.value = "开发， 审查, 稳定性";
    tags.dispatchEvent(new Event("input", { bubbles: true }));
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    await settle();

    expect(wrapper.emitted("save")?.[0]?.[0]).toEqual(
      expect.objectContaining({ tags: ["开发", "审查", "稳定性"] }),
    );
  });

  it("atomically resets form, tags, dirty baseline, and save target when the prompt target changes", async () => {
    const wrapper = track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt, categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const title = () =>
      document.body.querySelector<HTMLInputElement>(
        "[data-test='prompt-title']",
      )!;
    const tags = () =>
      document.body.querySelector<HTMLInputElement>(
        "[data-test='prompt-tags']",
      )!;
    title().value = "旧目标脏数据";
    title().dispatchEvent(new Event("input", { bubbles: true }));

    await wrapper.setProps({ prompt: null });
    await settle();
    expect(title().value).toBe("");
    expect(tags().value).toBe("");
    expect(confirmDialog).not.toHaveBeenCalled();
    title().value = "新建标题";
    title().dispatchEvent(new Event("input", { bubbles: true }));
    const body = document.body.querySelector<HTMLTextAreaElement>(
      ".editor-form textarea",
    )!;
    body.value = "新建正文";
    body.dispatchEvent(new Event("input", { bubbles: true }));
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    const newPromptSaves = wrapper.emitted("save") ?? [];
    expect(newPromptSaves[newPromptSaves.length - 1]?.[1]).toBeUndefined();

    await wrapper.setProps({ prompt: secondPrompt });
    await settle();
    expect(title().value).toBe("商业分析");
    expect(tags().value).toBe("商业，分析");
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    const existingPromptSaves = wrapper.emitted("save") ?? [];
    expect(existingPromptSaves[existingPromptSaves.length - 1]?.[1]).toBe(
      "prompt-b",
    );

    document.body
      .querySelector<HTMLButtonElement>("[data-test='cancel-prompt-edit']")!
      .click();
    await settle();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("ignores a stale dirty confirmation after the editor target changes", async () => {
    const pending = deferred<boolean>();
    confirmDialog.mockReturnValueOnce(pending.promise);
    const wrapper = await dirtyEditor();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ prompt: secondPrompt });
    await settle();
    pending.resolve(true);
    await settle();

    expect(wrapper.emitted("close")).toBeUndefined();
    expect(
      document.body.querySelector<HTMLInputElement>(
        "[data-test='prompt-title']",
      )?.value,
    ).toBe("商业分析");
  });

  it("keeps a dirty editor open after rejected Escape, then emits close without save after confirmation", async () => {
    confirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = await dirtyEditor();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="关闭编辑器"]')!
      .click();
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("save")).toBeUndefined();
  });

  it("routes outside dismissal through native dirty confirmation and blocks closing while saving", async () => {
    confirmDialog.mockResolvedValue(false);
    const wrapper = await dirtyEditor();
    const overlay =
      document.body.querySelector<HTMLElement>(".pd-dialog-overlay")!;
    overlay.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    await settle();
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("close")).toBeUndefined();

    await wrapper.setProps({ saving: true });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("locks every editable field and action while a save snapshot is in flight", async () => {
    const wrapper = track(
      mount(PromptEditorDialog, {
        attachTo: document.body,
        props: { prompt, categories, saving: false },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();
    const title = document.body.querySelector<HTMLInputElement>(
      "[data-test='prompt-title']",
    )!;
    title.value = "保存中的快照";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.setProps({ saving: true });
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    for (const field of dialog.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >(".editor-form input, .editor-form textarea")) {
      expect(field.disabled, `${field.tagName} should be disabled`).toBe(true);
    }
    expect(
      dialog.querySelector<HTMLButtonElement>(
        'button[role="combobox"][aria-label="分类"]',
      )?.disabled,
    ).toBe(true);

    title.value = "保存期间丢失的修改";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    title.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    dialog
      .querySelector<HTMLButtonElement>("[data-test='save-prompt']")!
      .click();
    dialog.querySelector<HTMLButtonElement>(".editor-delete")!.click();
    dialog
      .querySelector<HTMLButtonElement>("[data-test='cancel-prompt-edit']")!
      .click();
    await settle();

    expect(title.value).toBe("保存中的快照");
    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});

describe("StickyManagerDialog", () => {
  it("uses a named dialog and accessible icon controls for manual order", async () => {
    track(
      mount(StickyManagerDialog, {
        attachTo: document.body,
        props: {
          prompts: [prompt, { ...prompt, id: "prompt-b", title: "第二条" }],
        },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(
      dialog.querySelector('button[aria-label="上移"] svg'),
    ).not.toBeNull();
    expect(
      dialog.querySelector('button[aria-label="下移"] svg'),
    ).not.toBeNull();
    expect(dialog.textContent).not.toContain("↑");
    expect(dialog.textContent).not.toContain("↓");
    expect(
      dialog.querySelector<HTMLButtonElement>('button[aria-label="上移"]')
        ?.disabled,
    ).toBe(true);
  });

  it("syncs later prompt props while the local order is untouched", async () => {
    const wrapper = track(
      mount(StickyManagerDialog, {
        attachTo: document.body,
        props: { prompts: [] },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();
    expect(
      document.body.querySelectorAll("[data-test='sticky-manager-row']"),
    ).toHaveLength(0);

    await wrapper.setProps({ prompts: [prompt, secondPrompt] });
    await settle();

    const titles = Array.from(
      document.body.querySelectorAll("[data-test='sticky-manager-row'] strong"),
      (element) => element.textContent,
    );
    expect(titles).toEqual(["代码审查", "商业分析"]);
  });

  it("does not overwrite a user-reordered local draft with later props", async () => {
    const wrapper = track(
      mount(StickyManagerDialog, {
        attachTo: document.body,
        props: { prompts: [prompt, secondPrompt] },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    document.body
      .querySelectorAll<HTMLButtonElement>('button[aria-label="上移"]')[1]
      .click();
    await settle();
    await wrapper.setProps({ prompts: [{ ...prompt }, { ...secondPrompt }] });
    await settle();

    const titles = Array.from(
      document.body.querySelectorAll("[data-test='sticky-manager-row'] strong"),
      (element) => element.textContent,
    );
    expect(titles).toEqual(["商业分析", "代码审查"]);
  });

  it("does not restore a successfully removed local row from later props", async () => {
    const wrapper = track(
      mount(StickyManagerDialog, {
        attachTo: document.body,
        props: { prompts: [prompt, secondPrompt] },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    document.body.querySelector<HTMLButtonElement>("button.remove")!.click();
    await settle();
    expect(promptApi.setPinned).toHaveBeenCalledWith("prompt-a", false);

    await wrapper.setProps({ prompts: [{ ...prompt }, { ...secondPrompt }] });
    await settle();

    const titles = Array.from(
      document.body.querySelectorAll("[data-test='sticky-manager-row'] strong"),
      (element) => element.textContent,
    );
    expect(titles).toEqual(["商业分析"]);
  });

  it("persists the manually reordered five-slot payload", async () => {
    const second = { ...prompt, id: "prompt-b", title: "第二条" };
    const wrapper = track(
      mount(StickyManagerDialog, {
        attachTo: document.body,
        props: { prompts: [prompt, second] },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const moveUpButtons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="上移"]',
      ),
    );
    moveUpButtons[1].click();
    document.body
      .querySelector<HTMLButtonElement>("[data-test='save-sticky-order']")!
      .click();
    await settle();

    expect(promptApi.reorderSticky).toHaveBeenCalledWith([
      "prompt-b",
      "prompt-a",
    ]);
    expect(wrapper.emitted("changed")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
