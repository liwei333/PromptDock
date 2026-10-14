import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { promptApi, windowApi } = vi.hoisted(() => ({
  promptApi: { listSticky: vi.fn() },
  windowApi: {
    enterMainMode: vi.fn(),
    hideSticky: vi.fn(),
    showQuick: vi.fn(),
    getStickySettings: vi.fn(),
    setStickySettings: vi.fn(),
  },
}));

vi.mock("@/api/commands", () => ({
  promptApi,
  windowApi,
}));

import StickyWindow from "@/windows/StickyWindow.vue";

describe("StickyWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptApi.listSticky.mockResolvedValue([]);
    windowApi.enterMainMode.mockResolvedValue({ mode: "main" });
    windowApi.hideSticky.mockResolvedValue({ hidden: true });
    windowApi.showQuick.mockResolvedValue({ shown: true });
    windowApi.getStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
    });
    windowApi.setStickySettings.mockResolvedValue({
      visible: true,
      alwaysOnTop: true,
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
    });
  });

  it("always renders five fixed slots when the library has no pins", async () => {
    const wrapper = mount(StickyWindow);
    await flushPromises();
    expect(wrapper.findAll("[data-test='sticky-slot']")).toHaveLength(5);
    expect(wrapper.text()).toContain("空位 1");
    expect(wrapper.text()).toContain("0/5");
    wrapper.unmount();
  });

  it("switches to full mode from the title icon and footer", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-test='manage-in-main']").trigger("click");
    await flushPromises();

    expect(windowApi.enterMainMode).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("suppresses repeated full-mode transitions while one is pending", async () => {
    let resolveTransition!: (value: { mode: "main" }) => void;
    windowApi.enterMainMode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );
    const wrapper = mount(StickyWindow);
    const titleControl = wrapper.get("[aria-label='切换到完整模式']");

    await titleControl.trigger("click");
    await wrapper.get("[data-test='manage-in-main']").trigger("click");

    expect(windowApi.enterMainMode).toHaveBeenCalledOnce();
    expect(titleControl.attributes("disabled")).toBeDefined();
    expect(
      wrapper.get("[data-test='manage-in-main']").attributes("disabled"),
    ).toBeDefined();

    resolveTransition({ mode: "main" });
    await flushPromises();
    expect(titleControl.attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("renders accessible feedback when switching to full mode fails", async () => {
    windowApi.enterMainMode.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='切换到完整模式']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[aria-live='polite']").text()).toContain(
      "无法切换到完整模式",
    );
    wrapper.unmount();
  });

  it("keeps close as the explicit zero-window action", async () => {
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(windowApi.hideSticky).toHaveBeenCalledOnce();
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("handles a rejected close without opening full mode", async () => {
    windowApi.hideSticky.mockRejectedValueOnce(new Error("native failure"));
    const wrapper = mount(StickyWindow);

    await wrapper.get("[aria-label='收起便签']").trigger("click");
    await flushPromises();

    expect(wrapper.get("[aria-live='polite']").text()).toContain(
      "无法收起便签",
    );
    expect(windowApi.enterMainMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
