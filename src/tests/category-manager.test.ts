import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

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

describe("CategoryDeleteDialog", () => {
  it("requires a different destination and emits a confirmed transfer", async () => {
    const wrapper = mount(CategoryDeleteDialog, {
      props: { source: categories[0], categories },
    });

    expect(wrapper.text()).toContain("3 条提示词");
    expect(wrapper.find(`option[value="category-a"]`).exists()).toBe(false);
    expect(wrapper.get("[data-test='confirm-category-delete']").attributes("disabled")).toBeDefined();

    await wrapper.get("[data-test='category-transfer-target']").setValue("category-b");
    await wrapper.get("[data-test='confirm-category-delete']").trigger("click");

    expect(wrapper.emitted("confirm")).toEqual([["category-a", "category-b"]]);
  });

  it("closes without emitting a transfer when cancelled", async () => {
    const wrapper = mount(CategoryDeleteDialog, {
      props: { source: categories[0], categories },
    });

    await wrapper.get("[data-test='cancel-category-delete']").trigger("click");

    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
});

describe("CategoryManagerDialog", () => {
  it("lists counts and validates create and rename actions", async () => {
    const wrapper = mount(CategoryManagerDialog, { props: { categories } });

    expect(wrapper.findAll("[data-test='category-row']")).toHaveLength(2);
    expect(wrapper.text()).toContain("3 条提示词");

    await wrapper.get("[data-test='open-category-create']").trigger("click");
    await wrapper.get("[data-test='submit-category-create']").trigger("click");
    expect(wrapper.text()).toContain("请输入分类名称");
    await wrapper.get("[data-test='category-create-input']").setValue("  新分类  ");
    await wrapper.get("[data-test='submit-category-create']").trigger("click");
    expect(wrapper.emitted("create")).toEqual([["新分类"]]);

    await wrapper.get("[data-test='rename-category-category-a']").trigger("click");
    await wrapper.get("[data-test='category-rename-input']").setValue("  工程研发  ");
    await wrapper.get("[data-test='submit-category-rename']").trigger("click");
    expect(wrapper.emitted("rename")).toEqual([["category-a", "工程研发"]]);
  });

  it("opens safe deletion and disables deleting the final category", async () => {
    const wrapper = mount(CategoryManagerDialog, { props: { categories } });
    await wrapper.get("[data-test='delete-category-category-a']").trigger("click");
    expect(wrapper.findComponent(CategoryDeleteDialog).exists()).toBe(true);

    const only = mount(CategoryManagerDialog, {
      props: { categories: [categories[0]] },
    });
    expect(
      only.get("[data-test='delete-category-category-a']").attributes("disabled"),
    ).toBeDefined();
  });

  it("keeps the dialog open and shows a server error", () => {
    const wrapper = mount(CategoryManagerDialog, {
      props: { categories, error: "分类名称已经存在" },
    });
    expect(wrapper.get("[role='alert']").text()).toContain("分类名称已经存在");
    expect(wrapper.find("[role='dialog']").exists()).toBe(true);
  });
});
