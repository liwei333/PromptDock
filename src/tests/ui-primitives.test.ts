import { mount } from "@vue/test-utils";
import { AlertTriangle, Copy } from "lucide-vue-next";
import { describe, expect, it } from "vitest";

import PdBadge from "@/components/ui/PdBadge.vue";
import PdButton from "@/components/ui/PdButton.vue";
import PdIconButton from "@/components/ui/PdIconButton.vue";
import PdStatusMessage from "@/components/ui/PdStatusMessage.vue";

describe("PromptDock UI primitives", () => {
  it("exposes variants, accessible icon names, and visible tooltips", async () => {
    const button = mount(PdButton, {
      props: { variant: "primary", disabled: true },
      slots: { default: "复制" },
    });
    expect(button.get("button").attributes("data-variant")).toBe("primary");
    expect(button.get("button").attributes()).toHaveProperty("disabled");

    const icon = mount(PdIconButton, {
      attachTo: document.body,
      props: { label: "复制提示词", icon: Copy },
      global: { stubs: { Teleport: false } },
    });
    expect(icon.get('button[aria-label="复制提示词"]')).toBeTruthy();
    await icon.get("button").trigger("focus");
    expect(document.body.textContent).toContain("复制提示词");

    icon.unmount();
    button.unmount();
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
});
