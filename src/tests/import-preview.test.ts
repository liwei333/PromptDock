import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import ImportPreviewDialog from "@/components/ImportPreviewDialog.vue";

const preview = {
  token: "token-1",
  summary: {
    promptCount: 8,
    categoryCount: 3,
    idConflicts: 2,
    categoriesAdded: 1,
    invalidRecords: 0,
    sourceVersion: 1,
  },
};

afterEach(() => document.body.replaceChildren());

async function settle(): Promise<void> {
  await flushPromises();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await flushPromises();
}

describe("ImportPreviewDialog", () => {
  it("uses a named dialog, defaults to merge, and exposes validated counts", async () => {
    const wrapper = mount(ImportPreviewDialog, {
      attachTo: document.body,
      props: { preview },
      global: { stubs: { Teleport: false } },
    });
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe("确认导入备份");
    expect(dialog.textContent).toContain("8 条提示词");
    expect(dialog.textContent).toContain("2 个 ID 冲突");
    expect(dialog.textContent).toContain("先创建安全备份");
    expect(dialog.textContent).not.toContain("✓");
    expect(dialog.querySelector(".validation-note svg")).not.toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>("input[value='merge']")?.checked,
    ).toBe(true);
    expect(
      dialog.querySelector("fieldset.import-modes legend")?.textContent,
    ).toBe("导入方式");
    expect(
      dialog.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][name="import-mode"]',
      ),
    ).toHaveLength(2);

    dialog
      .querySelector<HTMLButtonElement>("[data-test='commit-import']")!
      .click();
    await settle();
    expect(wrapper.emitted("commit")).toEqual([["merge"]]);
    wrapper.unmount();
  });

  it("does not cancel from Escape or the close action while a transaction is busy", async () => {
    const wrapper = mount(ImportPreviewDialog, {
      attachTo: document.body,
      props: { preview, busy: true },
      global: { stubs: { Teleport: false } },
    });
    await settle();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    document.body
      .querySelector<HTMLElement>(".pd-dialog-overlay")!
      .dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    await settle();
    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="取消导入"]')!
      .click();
    await settle();

    expect(wrapper.emitted("cancel")).toBeUndefined();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    wrapper.unmount();
  });
});
