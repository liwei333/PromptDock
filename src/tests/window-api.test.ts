import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { windowApi } from "@/api/commands";

describe("windowApi", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("maps exclusive mode commands to their exact IPC names", async () => {
    invoke.mockResolvedValueOnce({ mode: "sticky" });
    await expect(windowApi.enterStickyMode()).resolves.toEqual({
      mode: "sticky",
    });
    expect(invoke).toHaveBeenLastCalledWith("enter_sticky_mode");

    invoke.mockResolvedValueOnce({ mode: "main" });
    await expect(windowApi.enterMainMode()).resolves.toEqual({ mode: "main" });
    expect(invoke).toHaveBeenLastCalledWith("enter_main_mode");
  });

  it("sends the sticky-manager intent only for task-specific main navigation", async () => {
    invoke.mockResolvedValueOnce({ mode: "main" });

    await expect(windowApi.enterMainMode("manage-sticky")).resolves.toEqual({
      mode: "main",
    });
    expect(invoke).toHaveBeenLastCalledWith("enter_main_mode", {
      intent: "manage-sticky",
    });
  });

  it("peeks and acknowledges a pending main intent through exact IPC commands", async () => {
    invoke.mockResolvedValueOnce({ id: 7, intent: "manage-sticky" });

    await expect(windowApi.peekMainIntent()).resolves.toEqual({
      id: 7,
      intent: "manage-sticky",
    });
    expect(invoke).toHaveBeenLastCalledWith("peek_main_intent");

    invoke.mockResolvedValueOnce({ acknowledged: true });
    await expect(windowApi.ackMainIntent(7)).resolves.toEqual({
      acknowledged: true,
    });
    expect(invoke).toHaveBeenLastCalledWith("ack_main_intent", { id: 7 });
  });

  it("sends only the requested sticky preference", async () => {
    invoke.mockResolvedValueOnce({
      visible: true,
      alwaysOnTop: false,
      density: "comfortable",
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
    });

    await windowApi.setStickySettings({ alwaysOnTop: false });

    expect(invoke).toHaveBeenLastCalledWith("set_sticky_settings", {
      settings: { alwaysOnTop: false },
    });

    invoke.mockResolvedValueOnce({
      visible: true,
      alwaysOnTop: false,
      density: "compact",
      x: 120,
      y: 80,
      monitorName: "Built-in Retina Display",
      scaleFactor: 2,
    });
    await windowApi.setStickySettings({ density: "compact" });
    expect(invoke).toHaveBeenLastCalledWith("set_sticky_settings", {
      settings: { density: "compact" },
    });
  });

  it("does not publish the old direct sticky-show API", () => {
    expect(windowApi).not.toHaveProperty("showSticky");
  });
});
