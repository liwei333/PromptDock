import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/commands", () => ({
  promptApi: { listSticky: vi.fn().mockResolvedValue([]) },
  windowApi: {
    hideSticky: vi.fn().mockResolvedValue({ hidden: true }),
    showQuick: vi.fn().mockResolvedValue({ shown: true }),
    getStickySettings: vi.fn().mockResolvedValue({ alwaysOnTop: true }),
    setStickySettings: vi.fn().mockResolvedValue({ alwaysOnTop: true }),
  },
}));

import StickyWindow from "@/windows/StickyWindow.vue";

describe("StickyWindow", () => {
  it("always renders five fixed slots when the library has no pins", async () => {
    const wrapper = mount(StickyWindow);
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(wrapper.text()).toContain("空位 1");
    expect(wrapper.text()).toContain("0/5");
  });
});
