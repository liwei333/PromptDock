export type DesktopUiPlatform = "macos" | "windows";

export function detectDesktopUiPlatform(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): DesktopUiPlatform {
  return /Mac/i.test(platform) ? "macos" : "windows";
}

export function shortcutLabels(platform: DesktopUiPlatform) {
  return platform === "macos"
    ? { localSearch: "⌘K", globalQuick: "Option+Space" }
    : { localSearch: "Ctrl+K", globalQuick: "Ctrl+Alt+Space" };
}
