import { mount, type VueWrapper } from "@vue/test-utils";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";
import { AlertTriangle, Copy } from "lucide-vue-next";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";
import PdTooltip from "@/components/ui/PdTooltip.vue";

const tokensCss = readFileSync(resolve("src/styles/tokens.css"), "utf8");

const attachedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of attachedWrappers.splice(0)) {
    wrapper.unmount();
  }
  document.body.replaceChildren();
  vi.useRealTimers();
});

function parseHexToken(name: string) {
  const match = tokensCss.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`),
  );

  expect(
    match,
    `Expected --${name} to be a concrete six-digit hex color`,
  ).not.toBeNull();
  return match![1];
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
}

describe("PromptDock UI primitives", () => {
  it("exposes variants, accessible icon names, and visible tooltips", async () => {
    const variants = ["primary", "secondary", "ghost", "danger"] as const;

    for (const variant of variants) {
      const button = mount(PdButton, {
        props: { variant, disabled: variant === "primary" },
        slots: { default: "复制" },
      });
      expect(button.get("button").attributes("data-variant")).toBe(variant);
      if (variant === "primary") {
        expect(button.get("button").attributes()).toHaveProperty("disabled");
      }
      button.unmount();
    }

    const icon = mount(PdIconButton, {
      attachTo: document.body,
      props: { label: "复制提示词", icon: Copy },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(icon);
    expect(icon.get('button[aria-label="复制提示词"]')).toBeTruthy();
    await icon.get("button").trigger("focus");
    expect(document.body.textContent).toContain("复制提示词");
  });

  it("forwards native attributes and listeners to the icon button exactly once", async () => {
    const onClick = vi.fn();
    const onKeydown = vi.fn();
    const icon = mount(PdIconButton, {
      props: {
        label: "复制提示词",
        icon: Copy,
        type: "submit",
        onClick,
      },
      attrs: {
        "data-test": "copy-trigger",
        "aria-current": "page",
        class: "consumer-class",
        onKeydown,
      },
    });
    const button = icon.get("button");

    expect(button.attributes("data-test")).toBe("copy-trigger");
    expect(button.attributes("aria-current")).toBe("page");
    expect(button.classes()).toContain("consumer-class");
    expect(button.attributes("type")).toBe("submit");

    await button.trigger("keydown", { key: "Enter" });
    await button.trigger("click");

    expect(onKeydown).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(icon.emitted("click")).toHaveLength(1);

    icon.unmount();
  });

  it("defaults the icon button native type to button", () => {
    const icon = mount(PdIconButton, {
      props: { label: "复制提示词", icon: Copy },
    });

    expect(icon.get("button").attributes("type")).toBe("button");

    icon.unmount();
  });

  it("renders loading semantics, slots, and semantic status roles", () => {
    const loading = mount(PdButton, {
      props: { loading: true },
      slots: { leading: "before", default: "保存", trailing: "after" },
    });
    expect(loading.get("button").attributes("aria-busy")).toBe("true");
    expect(loading.get("button").attributes()).toHaveProperty("disabled");
    expect(loading.text()).toContain("before");
    expect(loading.text()).toContain("after");

    const warning = mount(PdStatusMessage, {
      props: {
        tone: "warning",
        icon: AlertTriangle,
        message: "变量格式无效",
      },
    });
    expect(warning.get('[role="status"]').text()).toContain("变量格式无效");
    expect(warning.get("svg").attributes("aria-hidden")).toBe("true");

    const error = mount(PdStatusMessage, {
      props: { tone: "danger", message: "复制失败", live: "assertive" },
    });
    expect(error.get('[role="alert"]').text()).toContain("复制失败");

    error.unmount();
    warning.unmount();
    loading.unmount();
  });

  it("renders badge slot content with its semantic tone", () => {
    const badge = mount(PdBadge, {
      props: { tone: "success" },
      slots: { default: "已复制" },
    });

    expect(badge.attributes("data-tone")).toBe("success");
    expect(badge.text()).toBe("已复制");

    badge.unmount();
  });

  it.each([
    { tone: "danger", live: undefined, role: "alert", ariaLive: "assertive" },
    { tone: "danger", live: "off", role: undefined, ariaLive: "off" },
    { tone: "danger", live: "polite", role: "status", ariaLive: "polite" },
    { tone: "danger", live: "assertive", role: "alert", ariaLive: "assertive" },
    { tone: "info", live: undefined, role: "status", ariaLive: "polite" },
    { tone: "info", live: "off", role: undefined, ariaLive: "off" },
    { tone: "info", live: "polite", role: "status", ariaLive: "polite" },
    { tone: "info", live: "assertive", role: "alert", ariaLive: "assertive" },
  ] as const)(
    "resolves $tone with live=$live to role=$role and aria-live=$ariaLive",
    ({ tone, live, role, ariaLive }) => {
      const status = mount(PdStatusMessage, {
        props: { tone, message: "状态消息", live },
      });

      expect(status.attributes("role")).toBe(role);
      expect(status.attributes("aria-live")).toBe(ariaLive);

      status.unmount();
    },
  );

  it("opens tooltips immediately on focus and closes them with Escape", async () => {
    const tooltip = mount(PdTooltip, {
      attachTo: document.body,
      props: { text: "快捷提示", delayDuration: 0 },
      slots: { default: '<button type="button">打开</button>' },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(tooltip);

    await tooltip.get("button").trigger("focus");
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).not.toBeNull();

    await tooltip.get("button").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).toBeNull();
  });

  it("accepts a zero delay for deterministic hover interactions", async () => {
    vi.useFakeTimers();
    const tooltip = mount(PdTooltip, {
      attachTo: document.body,
      props: { text: "立即提示", delayDuration: 0 },
      slots: { default: '<button type="button">打开</button>' },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(tooltip);

    await tooltip
      .get("button")
      .trigger("pointermove", { pointerType: "mouse" });
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();

    expect(document.body.querySelector(".pd-tooltip-content")).not.toBeNull();
  });

  it("waits for the production delay before opening on hover", async () => {
    vi.useFakeTimers();
    const tooltip = mount(PdTooltip, {
      attachTo: document.body,
      props: { text: "延迟提示" },
      slots: { default: '<button type="button">打开</button>' },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(tooltip);

    await tooltip
      .get("button")
      .trigger("pointermove", { pointerType: "mouse" });
    expect(document.body.querySelector(".pd-tooltip-content")).toBeNull();

    await vi.advanceTimersByTimeAsync(499);
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).not.toBeNull();
  });

  it("removes portalled tooltip content when its wrapper unmounts", async () => {
    const tooltip = mount(PdTooltip, {
      attachTo: document.body,
      props: { text: "卸载提示", delayDuration: 0 },
      slots: { default: '<button type="button">打开</button>' },
      global: { stubs: { Teleport: false } },
    });
    attachedWrappers.push(tooltip);

    await tooltip.get("button").trigger("focus");
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).not.toBeNull();

    tooltip.unmount();
    await nextTick();
    expect(document.body.querySelector(".pd-tooltip-content")).toBeNull();
  });

  it.each([
    ["neutral", "pd-neutral-foreground", "pd-neutral-soft"],
    ["accent", "pd-accent-foreground", "pd-accent-soft"],
    ["success soft", "pd-success-foreground", "pd-success-soft"],
    ["success white", "pd-success-foreground", "pd-surface-elevated"],
    ["warning soft", "pd-warning-foreground", "pd-warning-soft"],
    ["warning white", "pd-warning-foreground", "pd-surface-elevated"],
    ["danger soft", "pd-danger-foreground", "pd-danger-soft"],
    ["danger white", "pd-danger-foreground", "pd-surface-elevated"],
  ])(
    "%s small-text foreground/background tokens meet WCAG AA contrast",
    (_label, foregroundToken, backgroundToken) => {
      const foreground = parseHexToken(foregroundToken);
      const background = parseHexToken(backgroundToken);

      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
