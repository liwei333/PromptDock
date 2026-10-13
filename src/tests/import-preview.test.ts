import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ImportPreviewDialog from "@/components/ImportPreviewDialog.vue";

describe("ImportPreviewDialog", () => {
  it("defaults to merge and exposes validated counts", async () => {
    const wrapper = mount(ImportPreviewDialog, {
      props: {
        preview: {
          token: "token-1",
          summary: {
            promptCount: 8,
            categoryCount: 3,
            idConflicts: 2,
            categoriesAdded: 1,
            invalidRecords: 0,
            sourceVersion: 1,
          },
        },
      },
    });
    expect(wrapper.text()).toContain("8 条提示词");
    expect(wrapper.text()).toContain("2 个 ID 冲突");
    expect(
      wrapper.get<HTMLInputElement>("input[value='merge']").element.checked,
    ).toBe(true);
    await wrapper.get("[data-test='commit-import']").trigger("click");
    expect(wrapper.emitted("commit")).toEqual([["merge"]]);
  });
});
