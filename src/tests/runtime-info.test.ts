import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeInfo } = vi.hoisted(() => ({ runtimeInfo: vi.fn() }));

vi.mock("@/api/commands", () => ({
  windowApi: { runtimeInfo },
}));

import RuntimeInfoDialog from "@/components/RuntimeInfoDialog.vue";

describe("RuntimeInfoDialog", () => {
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
    const wrapper = mount(RuntimeInfoDialog);
    await flushPromises();

    expect(wrapper.text()).toContain("提示词以明文 SQLite 保存在这台设备");
    expect(wrapper.text()).not.toContain("这台 Mac");
  });
});
