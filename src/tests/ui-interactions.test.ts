import { mount, type VueWrapper } from "@vue/test-utils";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";
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
const globalCss = readFileSync(resolve("src/styles/global.css"), "utf8");

const attachedWrappers: VueWrapper[] = [];

function trackWrapper<T extends VueWrapper>(wrapper: T): T {
  attachedWrappers.push(wrapper);
  return wrapper;
}

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
    const select = trackWrapper(
      mount(PdSelect, {
        attachTo: document.body,
        props: { modelValue: "recent", label: "排序", options },
        global: { stubs: { Teleport: false } },
      }),
    );

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

    const toggle = trackWrapper(
      mount(PdToggle, {
        props: { pressed: false, label: "收藏" },
      }),
    );
    const toggleButton = toggle.get('button[aria-label="收藏"]');
    expect(toggleButton.attributes("type")).toBe("button");
    expect(toggleButton.attributes("aria-pressed")).toBe("false");
    await toggleButton.trigger("click");
    expect(toggle.emitted("update:pressed")).toEqual([[true]]);

    const switchControl = trackWrapper(
      mount(PdSwitch, {
        props: { modelValue: false, label: "始终置顶" },
      }),
    );
    const switchButton = switchControl.get(
      'button[role="switch"][aria-label="始终置顶"]',
    );
    expect(switchButton.attributes("type")).toBe("button");
    expect(switchButton.attributes("aria-checked")).toBe("false");
    await switchButton.trigger("click");
    expect(switchControl.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("emits one dismiss when the accessible dialog close button is used", async () => {
    const dialog = trackWrapper(
      mount(PdDialog, {
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
      }),
    );
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
    const host = trackWrapper(
      mount(Host, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );

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

  it("restores focus independently for every open cycle without stealing it after a closed dialog unmounts", async () => {
    const Host = defineComponent({
      components: { PdDialog },
      setup() {
        const open = ref(false);
        const showDialogHost = ref(true);
        const dismiss = () => {
          open.value = false;
        };
        return { dismiss, open, showDialogHost };
      },
      template: `
        <button type="button" data-test="opener-a" @click="open = true">A</button>
        <button type="button" data-test="opener-b" @click="open = true">B</button>
        <button type="button" data-test="connected-control">Connected</button>
        <button type="button" data-test="unmount-dialog-host" @click="showDialogHost = false">Unmount</button>
        <div v-if="showDialogHost">
          <PdDialog :open="open" title="分类管理" @dismiss="dismiss">
            <button type="button" data-test="dialog-action">新建分类</button>
          </PdDialog>
        </div>
      `,
    });
    const host = trackWrapper(
      mount(Host, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );

    const openerA = host.get<HTMLButtonElement>("[data-test='opener-a']");
    openerA.element.focus();
    await openerA.trigger("click");
    await settleInteraction();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();
    expect(document.activeElement).toBe(openerA.element);

    const openerB = host.get<HTMLButtonElement>("[data-test='opener-b']");
    openerB.element.focus();
    await openerB.trigger("click");
    await settleInteraction();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();
    expect(document.activeElement).toBe(openerB.element);

    const connectedControl = host.get<HTMLButtonElement>(
      "[data-test='connected-control']",
    );
    connectedControl.element.focus();
    expect(document.activeElement).toBe(connectedControl.element);
    await host.get("[data-test='unmount-dialog-host']").trigger("click");
    await settleInteraction();
    expect(document.activeElement).toBe(connectedControl.element);
  });

  it("restores the active element captured by an initially open dialog", async () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Initial opener";
    document.body.append(opener);
    opener.focus();

    const Host = defineComponent({
      components: { PdDialog },
      setup() {
        const open = ref(true);
        const dismiss = () => {
          open.value = false;
        };
        return { dismiss, open };
      },
      template: `
        <PdDialog :open="open" title="分类管理" @dismiss="dismiss">
          <button type="button">新建分类</button>
        </PdDialog>
      `,
    });
    trackWrapper(
      mount(Host, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );
    await settleInteraction();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();

    expect(document.activeElement).toBe(opener);
  });

  it("forwards dialog content attributes and listeners to the dialog element", async () => {
    const onKeydown = vi.fn();
    trackWrapper(
      mount(PdDialog, {
        attachTo: document.body,
        props: { open: true, title: "分类管理" },
        attrs: {
          "data-test": "dialog-content",
          "aria-describedby": "consumer-description",
          class: "consumer-dialog-class",
          onKeydown,
        },
        slots: { default: '<button type="button">确认</button>' },
        global: { stubs: { Teleport: false } },
      }),
    );
    await settleInteraction();

    const content = getRole("dialog");
    expect(content.getAttribute("data-test")).toBe("dialog-content");
    expect(content.getAttribute("aria-describedby")).toBe(
      "consumer-description",
    );
    expect(content.classList).toContain("pd-dialog-content");
    expect(content.classList).toContain("consumer-dialog-class");

    content.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(onKeydown).toHaveBeenCalledTimes(1);
  });

  it("dismisses once when Escape first closes the focused close-button tooltip", async () => {
    const Host = defineComponent({
      components: { PdDialog },
      setup() {
        const open = ref(true);
        const dismissCount = ref(0);
        const dismiss = () => {
          dismissCount.value += 1;
          open.value = false;
        };
        return { dismiss, dismissCount, open };
      },
      template: `
        <output data-test="dismiss-count">{{ dismissCount }}</output>
        <PdDialog :open="open" title="分类管理" @dismiss="dismiss">
          <button type="button">新建分类</button>
        </PdDialog>
      `,
    });
    const host = trackWrapper(
      mount(Host, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );
    await settleInteraction();

    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭分类管理"]',
    );
    expect(close).not.toBeNull();
    close!.focus();
    await settleInteraction();
    expect(document.body.querySelector(".pd-tooltip-content")).not.toBeNull();

    close!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settleInteraction();

    expect(host.get("[data-test='dismiss-count']").text()).toBe("1");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector(".pd-tooltip-content")).toBeNull();
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

      const dialog = trackWrapper(
        mount(PdDialog, {
          attachTo: document.body,
          props: { open: true, title: "分类管理", closeOnOutside },
          slots: { default: '<button type="button">确认</button>' },
          global: { stubs: { Teleport: false } },
        }),
      );
      await settleInteraction();

      outside.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await settleInteraction();

      expect(dialog.emitted("dismiss") ?? []).toHaveLength(expectedDismisses);
    },
  );

  it("supports select keyboard selection and restores trigger focus on Escape", async () => {
    const select = trackWrapper(
      mount(PdSelect, {
        attachTo: document.body,
        props: { modelValue: "recent", label: "排序", options },
        global: { stubs: { Teleport: false } },
      }),
    );
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
    const select = trackWrapper(
      mount(PdSelect, {
        attachTo: document.body,
        props: {
          modelValue: "recent",
          label: "排序",
          options: disabledOptions,
        },
        global: { stubs: { Teleport: false } },
      }),
    );

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

  it("forwards select attributes and listeners to its labelled button trigger", async () => {
    const onKeydown = vi.fn();
    const select = trackWrapper(
      mount(PdSelect, {
        props: { modelValue: "recent", label: "排序", options },
        attrs: {
          "data-test": "sort-trigger",
          id: "prompt-sort",
          class: "consumer-select-class",
          onKeydown,
        },
      }),
    );

    const trigger = select.get('button[role="combobox"]');
    expect(trigger.attributes("data-test")).toBe("sort-trigger");
    expect(trigger.attributes("id")).toBe("prompt-sort");
    expect(trigger.classes()).toContain("pd-select-trigger");
    expect(trigger.classes()).toContain("consumer-select-class");
    expect(trigger.attributes("type")).toBe("button");
    expect(trigger.attributes("aria-label")).toBe("排序");

    await trigger.trigger("keydown", { key: "a", code: "KeyA" });
    expect(onKeydown).toHaveBeenCalledTimes(1);
  });

  it("uses the empty select value as a placeholder and opens with no options", async () => {
    const select = trackWrapper(
      mount(PdSelect, {
        attachTo: document.body,
        props: {
          modelValue: "",
          label: "排序",
          options: [],
          placeholder: "选择排序",
        },
        global: { stubs: { Teleport: false } },
      }),
    );
    const trigger = select.get('button[role="combobox"]');
    expect(trigger.text()).toContain("选择排序");

    await openSelect(select);
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it("filters empty select option values while keeping valid options interactive", async () => {
    const mixedOptions: PdSelectOption[] = [
      { value: "", label: "无效空值" },
      ...options,
    ];
    const select = trackWrapper(
      mount(PdSelect, {
        attachTo: document.body,
        props: { modelValue: "", label: "排序", options: mixedOptions },
        global: { stubs: { Teleport: false } },
      }),
    );

    await openSelect(select);
    const renderedOptions = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(renderedOptions.map((option) => option.textContent?.trim())).toEqual(
      ["最近更新", "最常使用"],
    );
    expect(document.activeElement).toBe(getRole("option", "最近更新"));

    getRole("option", "最常使用").dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );
    await settleInteraction();
    expect(select.emitted("update:modelValue")).toEqual([["popular"]]);
  });

  it("keeps disabled select, toggle, and switch controls inert", async () => {
    const select = trackWrapper(
      mount(PdSelect, {
        props: {
          modelValue: "recent",
          label: "排序",
          options,
          disabled: true,
        },
      }),
    );
    const selectTrigger = select.get('button[role="combobox"]');
    expect(selectTrigger.attributes()).toHaveProperty("disabled");
    await selectTrigger.trigger("keydown", { key: "Enter", code: "Enter" });
    expect(selectTrigger.attributes("aria-expanded")).toBe("false");

    const toggle = trackWrapper(
      mount(PdToggle, {
        props: { pressed: false, label: "收藏", disabled: true },
      }),
    );
    const toggleButton = toggle.get('button[aria-label="收藏"]');
    expect(toggleButton.attributes()).toHaveProperty("disabled");
    await toggleButton.trigger("click");
    expect(toggle.emitted("update:pressed")).toBeUndefined();

    const switchControl = trackWrapper(
      mount(PdSwitch, {
        props: { modelValue: false, label: "始终置顶", disabled: true },
      }),
    );
    const switchButton = switchControl.get('button[role="switch"]');
    expect(switchButton.attributes()).toHaveProperty("disabled");
    await switchButton.trigger("click");
    expect(switchControl.emitted("update:modelValue")).toBeUndefined();

    expect(globalCss).toContain(".pd-toggle:hover:not(:disabled)");
    expect(globalCss).not.toMatch(/\.pd-toggle:hover\s*\{/);
  });
});
