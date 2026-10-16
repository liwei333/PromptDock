import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import CategoryDeleteDialog from "@/components/CategoryDeleteDialog.vue";
import CategoryManagerDialog from "@/components/CategoryManagerDialog.vue";
import type { Category } from "@/types/prompt";

const categories: Category[] = [
  {
    id: "category-a",
    name: "开发工具",
    icon: "folder",
    color: "#2469f6",
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 3,
  },
  {
    id: "category-b",
    name: "商业分析",
    icon: "folder",
    color: "#2fb79f",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
    promptCount: 2,
  },
];

const wrappers: VueWrapper[] = [];

function track<T extends VueWrapper>(wrapper: T): T {
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

async function settle(): Promise<void> {
  await flushPromises();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await flushPromises();
}

function getDialog(name: string): HTMLElement {
  const dialogs = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="dialog"]'),
  );
  const dialog = dialogs.find((candidate) => {
    const titleId = candidate.getAttribute("aria-labelledby");
    return titleId && document.getElementById(titleId)?.textContent === name;
  });
  expect(dialog, `Expected dialog named ${name}`).toBeDefined();
  return dialog!;
}

async function chooseOption(label: string, optionName: string): Promise<void> {
  const trigger = document.body.querySelector<HTMLButtonElement>(
    `button[role="combobox"][aria-label="${label}"]`,
  );
  expect(trigger).not.toBeNull();
  trigger!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
    }),
  );
  await settle();
  const option = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((candidate) => candidate.textContent?.trim() === optionName);
  expect(option, `Expected option named ${optionName}`).toBeDefined();
  option!.dispatchEvent(
    new MouseEvent("pointerup", { bubbles: true, button: 0 }),
  );
  await settle();
}

describe("CategoryDeleteDialog", () => {
  it("uses a named modal and real shared select for a different destination", async () => {
    const wrapper = track(
      mount(CategoryDeleteDialog, {
        attachTo: document.body,
        props: { source: categories[0], categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    expect(getDialog("删除分类 · 安全迁移").textContent).toContain(
      "3 条提示词",
    );
    expect(wrapper.find("select").exists()).toBe(false);
    expect(
      document.body
        .querySelector<HTMLButtonElement>(
          "[data-test='confirm-category-delete']",
        )
        ?.hasAttribute("disabled"),
    ).toBe(true);

    await chooseOption("提示词转移至", "商业分析");
    document.body
      .querySelector<HTMLButtonElement>(
        "[data-test='confirm-category-delete']",
      )!
      .click();
    await settle();

    expect(wrapper.emitted("confirm")).toEqual([["category-a", "category-b"]]);
  });

  it("blocks every accidental dismissal while a transfer is busy", async () => {
    const wrapper = track(
      mount(CategoryDeleteDialog, {
        attachTo: document.body,
        props: { source: categories[0], categories, busy: true },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="取消删除"]')!
      .click();
    await settle();

    expect(wrapper.emitted("cancel")).toBeUndefined();
    expect(getDialog("删除分类 · 安全迁移")).toBeDefined();
  });
});

describe("CategoryManagerDialog", () => {
  it("lists counts and validates unchanged create and rename outcomes", async () => {
    const wrapper = track(
      mount(CategoryManagerDialog, {
        attachTo: document.body,
        props: { categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const dialog = getDialog("分类管理");
    expect(dialog.querySelectorAll("[data-test='category-row']")).toHaveLength(
      2,
    );
    expect(dialog.textContent).toContain("3 条提示词");
    expect(
      dialog.querySelector('button[aria-label="关闭分类管理"] svg'),
    ).not.toBeNull();
    expect(
      Array.from(dialog.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "×",
      ),
    ).toBe(false);

    dialog
      .querySelector<HTMLButtonElement>("[data-test='open-category-create']")!
      .click();
    await settle();
    dialog
      .querySelector<HTMLButtonElement>("[data-test='submit-category-create']")!
      .click();
    await settle();
    expect(dialog.textContent).toContain("请输入分类名称");
    const createInput = dialog.querySelector<HTMLInputElement>(
      "[data-test='category-create-input']",
    )!;
    createInput.value = "  新分类  ";
    createInput.dispatchEvent(new Event("input", { bubbles: true }));
    dialog
      .querySelector<HTMLButtonElement>("[data-test='submit-category-create']")!
      .click();
    await settle();
    expect(wrapper.emitted("create")).toEqual([["新分类"]]);

    dialog
      .querySelector<HTMLButtonElement>(
        "[data-test='rename-category-category-a']",
      )!
      .click();
    await settle();
    const renameInput = dialog.querySelector<HTMLInputElement>(
      "[data-test='category-rename-input']",
    )!;
    renameInput.value = "  工程研发  ";
    renameInput.dispatchEvent(new Event("input", { bubbles: true }));
    dialog
      .querySelector<HTMLButtonElement>("[data-test='submit-category-rename']")!
      .click();
    await settle();
    expect(wrapper.emitted("rename")).toEqual([["category-a", "工程研发"]]);
  });

  it("returns focus to the delete invoker after cancelling the nested dialog", async () => {
    track(
      mount(CategoryManagerDialog, {
        attachTo: document.body,
        props: { categories },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const deleteButton = document.body.querySelector<HTMLButtonElement>(
      "[data-test='delete-category-category-a']",
    )!;
    deleteButton.focus();
    deleteButton.click();
    await settle();
    expect(getDialog("删除分类 · 安全迁移")).toBeDefined();

    document.body
      .querySelector<HTMLButtonElement>("[data-test='cancel-category-delete']")!
      .click();
    await settle();

    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(deleteButton);
  });

  it("disables deleting the final category and keeps server errors in the dialog", async () => {
    const wrapper = track(
      mount(CategoryManagerDialog, {
        attachTo: document.body,
        props: {
          categories: [categories[0]],
          error: "分类名称已经存在",
        },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    const deleteButton = document.body.querySelector<HTMLButtonElement>(
      "[data-test='delete-category-category-a']",
    )!;
    expect(deleteButton.disabled).toBe(false);
    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    const helpId = deleteButton.getAttribute("aria-describedby")!;
    expect(document.getElementById(helpId)?.textContent).toContain(
      "至少保留一个分类",
    );
    deleteButton.focus();
    await settle();
    expect(
      document.body.querySelector(".pd-tooltip-content")?.textContent,
    ).toContain("至少保留一个分类");
    deleteButton.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    deleteButton.click();
    await settle();
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(
      getDialog("分类管理").querySelector('[role="alert"]')?.textContent,
    ).toContain("分类名称已经存在");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("guards create and rename keyboard submission while busy", async () => {
    const wrapper = track(
      mount(CategoryManagerDialog, {
        attachTo: document.body,
        props: { categories, busy: false },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settle();

    document.body
      .querySelector<HTMLButtonElement>("[data-test='open-category-create']")!
      .click();
    await settle();
    const createInput = document.body.querySelector<HTMLInputElement>(
      "[data-test='category-create-input']",
    )!;
    createInput.value = "键盘新建";
    createInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.setProps({ busy: true });
    expect(createInput.disabled).toBe(true);
    createInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await settle();
    expect(wrapper.emitted("create")).toBeUndefined();
    await wrapper.setProps({ busy: false });
    createInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await settle();
    expect(wrapper.emitted("create")).toEqual([["键盘新建"]]);

    document.body
      .querySelector<HTMLButtonElement>(
        "[data-test='rename-category-category-a']",
      )!
      .click();
    await settle();
    const renameInput = document.body.querySelector<HTMLInputElement>(
      "[data-test='category-rename-input']",
    )!;
    renameInput.value = "键盘重命名";
    renameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.setProps({ busy: true });
    expect(renameInput.disabled).toBe(true);
    renameInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await settle();
    expect(wrapper.emitted("rename")).toBeUndefined();
    await wrapper.setProps({ busy: false });
    renameInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await settle();
    expect(wrapper.emitted("rename")).toEqual([["category-a", "键盘重命名"]]);
  });
});
