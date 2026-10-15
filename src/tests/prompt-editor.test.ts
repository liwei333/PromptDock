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
