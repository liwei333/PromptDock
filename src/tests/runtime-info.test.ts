import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeInfo } = vi.hoisted(() => ({ runtimeInfo: vi.fn() }));

vi.mock("@/api/commands", () => ({
  windowApi: { runtimeInfo },
}));

import RuntimeInfoDialog from "@/components/RuntimeInfoDialog.vue";

describe("RuntimeInfoDialog", () => {
  afterEach(() => document.body.replaceChildren());

  beforeEach(() => {
    runtimeInfo.mockReset();
    runtimeInfo.mockResolvedValue({
      dbPath:
        "C:\\Users\\tester\\AppData\\Roaming\\PromptDock\\promptdock.sqlite3",
      version: "1.1.1",
      shortcut: {
        accelerator: "Ctrl+Alt+Space",
        registered: true,
        error: null,
      },
    });
  });

  it("describes local storage without claiming the device is a Mac", async () => {
    mount(RuntimeInfoDialog, {
      attachTo: document.body,
      global: { stubs: { Teleport: false } },
    });
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe(
      "PromptDock 状态",
    );
    expect(dialog.textContent).toContain("提示词以明文 SQLite 保存在这台设备");
    expect(dialog.textContent).toContain("Ctrl+Alt+Space · 已注册");
    expect(dialog.textContent).not.toContain("这台 Mac");
    expect(
      document.body.querySelector('button[aria-label="关闭运行信息"] svg'),
    ).not.toBeNull();
  });

  it("announces runtime loading failures as blocking errors", async () => {
    runtimeInfo.mockRejectedValue(new Error("无法读取运行信息"));
    mount(RuntimeInfoDialog, {
      attachTo: document.body,
      global: { stubs: { Teleport: false } },
    });
    await flushPromises();

    expect(
      document.body.querySelector('[role="alert"]')?.textContent,
    ).toContain("无法读取运行信息");
  });
});
