import { describe, expect, it } from "vitest";

import { detectDesktopUiPlatform, shortcutLabels } from "@/ui/platform";

describe("desktop UI platform labels", () => {
  it("uses familiar macOS shortcut labels", () => {
    expect(shortcutLabels("macos")).toEqual({
      localSearch: "⌘K",
      globalQuick: "Option+Space",
    });
  });

  it("uses familiar Windows shortcut labels", () => {
    expect(shortcutLabels("windows")).toEqual({
      localSearch: "Ctrl+K",
      globalQuick: "Ctrl+Alt+Space",
    });
  });

  it.each(["MacIntel", "MacPPC", "macOS"])(
    "detects the injected Mac-like platform %s without mutating navigator",
    (platform) => {
      expect(detectDesktopUiPlatform(platform)).toBe("macos");
    },
  );

  it.each(["Win32", "Win64", "Linux x86_64"])(
    "maps the injected Win/Linux-like platform %s to the Windows UI contract",
    (platform) => {
      expect(detectDesktopUiPlatform(platform)).toBe("windows");
    },
  );
});
