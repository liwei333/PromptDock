import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import PdDialog from "@/components/ui/PdDialog.vue";
import PdSelect, { type PdSelectOption } from "@/components/ui/PdSelect.vue";
import PdSwitch from "@/components/ui/PdSwitch.vue";
import PdToggle from "@/components/ui/PdToggle.vue";

const options: PdSelectOption[] = [
  { value: "recent", label: "最近更新" },
  { value: "popular", label: "最常使用" },
];

const attachedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of attachedWrappers.splice(0)) {
    wrapper.unmount();
  }
  vi.useRealTimers();
  document.body.replaceChildren();
  document.body.removeAttribute("style");
});

async function settleInteraction(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function getRole(role: string, name?: string): HTMLElement {
  const candidates = Array.from(
    document.body.querySelectorAll<HTMLElement>(`[role="${role}"]`),
  );
  const match = name
    ? candidates.find(
        (element) =>
          element.getAttribute("aria-label") === name ||
          element.textContent?.trim() === name,
      )
    : candidates[0];

  expect(
    match,
    `Expected role=${role}${name ? ` named ${name}` : ""}`,
  ).toBeDefined();
  return match!;
}

function openSelect(wrapper: VueWrapper): Promise<void> {
  return wrapper
    .get('button[role="combobox"][aria-label="排序"]')
    .trigger("keydown", { key: "Enter", code: "Enter" })
    .then(settleInteraction);
}

describe("PromptDock interaction wrappers", () => {
  it("emits controlled select, toggle, and switch values from real controls", async () => {
    const select = mount(PdSelect, {
      attachTo: document.body,
      props: { modelValue: "recent", label: "排序", options },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(select);

    const selectTrigger = select.get(
      'button[role="combobox"][aria-label="排序"]',
    );
    expect(selectTrigger.attributes("type")).toBe("button");
    await openSelect(select);

    const popularOption = getRole("option", "最常使用");
    popularOption.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );
    await settleInteraction();
    expect(select.emitted("update:modelValue")).toEqual([["popular"]]);

    const toggle = mount(PdToggle, {
      props: { pressed: false, label: "收藏" },
    });
    const toggleButton = toggle.get('button[aria-label="收藏"]');
    expect(toggleButton.attributes("type")).toBe("button");
    expect(toggleButton.attributes("aria-pressed")).toBe("false");
    await toggleButton.trigger("click");
    expect(toggle.emitted("update:pressed")).toEqual([[true]]);

    const switchControl = mount(PdSwitch, {
      props: { modelValue: false, label: "始终置顶" },
    });
    const switchButton = switchControl.get(
      'button[role="switch"][aria-label="始终置顶"]',
    );
    expect(switchButton.attributes("type")).toBe("button");
    expect(switchButton.attributes("aria-checked")).toBe("false");
    await switchButton.trigger("click");
    expect(switchControl.emitted("update:modelValue")).toEqual([[true]]);

    switchControl.unmount();
    toggle.unmount();
  });

  it("emits one dismiss when the accessible dialog close button is used", async () => {
    const dialog = mount(PdDialog, {
      attachTo: document.body,
      props: {
        open: true,
        title: "分类管理",
        description: "管理本地分类",
      },
      slots: {
        default: '<button type="button">新建分类</button>',
      },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(dialog);
    await settleInteraction();

    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭分类管理"]',
    );
    expect(close).not.toBeNull();
    close!.click();
    await nextTick();

    expect(dialog.emitted("dismiss")).toHaveLength(1);
  });

  it("moves focus into a modal and restores its connected trigger after Escape", async () => {
    const Host = defineComponent({
      components: { PdDialog },
      setup() {
        const open = ref(false);
        const dismissCount = ref(0);
        const dismiss = () => {
          dismissCount.value += 1;
          open.value = false;
        };
        return { dismiss, dismissCount, open };
      },
      template: `
        <button type="button" data-test="dialog-trigger" @click="open = true">管理分类</button>
        <output data-test="dismiss-count">{{ dismissCount }}</output>
        <PdDialog v-if="open" :open="true" title="分类管理" @dismiss="dismiss">
          <button type="button" data-test="dialog-action">新建分类</button>
        </PdDialog>
      `,
    });
    const host = mount(Host, {
      attachTo: document.body,
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(host);

    const trigger = host.get<HTMLButtonElement>("[data-test='dialog-trigger']");
    trigger.element.focus();
    expect(document.activeElement).toBe(trigger.element);
    await trigger.trigger("click");
    await settleInteraction();

    const modal = getRole("dialog");
    expect(document.activeElement).not.toBe(document.body);
    expect(modal.contains(document.activeElement)).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();

    expect(host.get("[data-test='dismiss-count']").text()).toBe("1");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.element.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger.element);
  });

  it.each([
    { closeOnOutside: false, expectedDismisses: 0 },
    { closeOnOutside: true, expectedDismisses: 1 },
  ])(
    "handles a real outside pointer interaction when closeOnOutside=$closeOnOutside",
    async ({ closeOnOutside, expectedDismisses }) => {
      const outside = document.createElement("button");
      outside.type = "button";
      outside.textContent = "外部控件";
      document.body.append(outside);

      const dialog = mount(PdDialog, {
        attachTo: document.body,
        props: { open: true, title: "分类管理", closeOnOutside },
        slots: { default: '<button type="button">确认</button>' },
        global: { stubs: { Teleport: false } },
      });
      attachedWrappers.push(dialog);
      await settleInteraction();

      outside.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await settleInteraction();

      expect(dialog.emitted("dismiss") ?? []).toHaveLength(expectedDismisses);
    },
  );

  it("supports select keyboard selection and restores trigger focus on Escape", async () => {
    const select = mount(PdSelect, {
      attachTo: document.body,
      props: { modelValue: "recent", label: "排序", options },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(select);
    const trigger = select.get<HTMLButtonElement>(
      'button[role="combobox"][aria-label="排序"]',
    );

    trigger.element.focus();
    await openSelect(select);
    const recent = getRole("option", "最近更新");
    expect(document.activeElement).toBe(recent);

    recent.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await settleInteraction();
    const popular = getRole("option", "最常使用");
    expect(document.activeElement).toBe(popular);
    popular.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await settleInteraction();
    expect(select.emitted("update:modelValue")).toEqual([["popular"]]);

    await openSelect(select);
    expect(getRole("listbox")).toBeTruthy();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("exposes disabled select options and skips them during keyboard focus", async () => {
    const disabledOptions: PdSelectOption[] = [
      options[0],
      { ...options[1], disabled: true },
      { value: "oldest", label: "最早更新" },
    ];
    const select = mount(PdSelect, {
      attachTo: document.body,
      props: { modelValue: "recent", label: "排序", options: disabledOptions },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(select);

    await openSelect(select);
    const recent = getRole("option", "最近更新");
    const disabled = getRole("option", "最常使用");
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(disabled.hasAttribute("data-disabled")).toBe(true);

    recent.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await settleInteraction();
    expect(document.activeElement).toBe(getRole("option", "最早更新"));

    disabled.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );
    await settleInteraction();
    expect(select.emitted("update:modelValue")).toBeUndefined();
  });

  it("keeps disabled select and switch controls inert", async () => {
    const select = mount(PdSelect, {
      props: {
        modelValue: "recent",
        label: "排序",
        options,
        disabled: true,
      },
    });
    const selectTrigger = select.get('button[role="combobox"]');
    expect(selectTrigger.attributes()).toHaveProperty("disabled");
    await selectTrigger.trigger("keydown", { key: "Enter", code: "Enter" });
    expect(selectTrigger.attributes("aria-expanded")).toBe("false");

    const switchControl = mount(PdSwitch, {
      props: { modelValue: false, label: "始终置顶", disabled: true },
    });
    const switchButton = switchControl.get('button[role="switch"]');
    expect(switchButton.attributes()).toHaveProperty("disabled");
    await switchButton.trigger("click");
    expect(switchControl.emitted("update:modelValue")).toBeUndefined();

    switchControl.unmount();
    select.unmount();
  });
});
