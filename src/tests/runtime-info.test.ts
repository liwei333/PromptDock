import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeInfo } = vi.hoisted(() => ({ runtimeInfo: vi.fn() }));

vi.mock("@/api/commands", () => ({
  windowApi: { runtimeInfo },
}));

import RuntimeInfoDialog from "@/components/RuntimeInfoDialog.vue";

const wrappers: VueWrapper[] = [];

function track<T extends VueWrapper>(wrapper: T): T {
  wrappers.push(wrapper);
  return wrapper;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function runtimeState(wrapper: VueWrapper) {
  return (
    wrapper.vm.$ as unknown as {
      setupState: { error: string; info: unknown };
    }
  ).setupState;
}

describe("RuntimeInfoDialog", () => {
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      if (wrapper.exists()) wrapper.unmount();
    }
    document.body.replaceChildren();
  });

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
    track(
      mount(RuntimeInfoDialog, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );
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
    track(
      mount(RuntimeInfoDialog, {
        attachTo: document.body,
        global: { stubs: { Teleport: false } },
      }),
    );
    await flushPromises();

    expect(
      document.body.querySelector('[role="alert"]')?.textContent,
    ).toContain("无法读取运行信息");
  });

  it.each(["resolve", "reject"] as const)(
    "does not write %s state after unmount",
    async (outcome) => {
      const pending = deferred<Awaited<ReturnType<typeof runtimeInfo>>>();
      runtimeInfo.mockReturnValueOnce(pending.promise);
      const wrapper = track(
        mount(RuntimeInfoDialog, {
          attachTo: document.body,
          global: { stubs: { Teleport: false } },
        }),
      );
      expect(runtimeState(wrapper).info).toBeNull();
      expect(runtimeState(wrapper).error).toBe("");
      wrapper.unmount();

      if (outcome === "resolve") {
        pending.resolve({
          dbPath: "/tmp/promptdock.sqlite3",
          version: "1.1.1",
          shortcut: {
            accelerator: "Option+Space",
            registered: true,
            error: null,
          },
        });
      } else {
        pending.reject(new Error("late failure"));
      }
      await flushPromises();

      expect(runtimeState(wrapper).info).toBeNull();
      expect(runtimeState(wrapper).error).toBe("");
    },
  );
});
