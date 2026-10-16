export type ShortcutStatus = {
  accelerator: string;
  registered: boolean;
  error: string | null;
};

export type RuntimeInfo = {
  dbPath: string;
  version: string;
  shortcut: ShortcutStatus;
};

export type MainIntent = "manage-sticky";

export type PendingMainIntent = {
  id: number;
  intent: MainIntent;
};

export type StickyDensity = "comfortable" | "compact";

export type StickySettings = {
  visible: boolean;
  alwaysOnTop: boolean;
  density: StickyDensity;
  x: number | null;
  y: number | null;
  monitorName: string | null;
  scaleFactor: number | null;
};

export type StickySettingsPatch = {
  alwaysOnTop?: boolean;
  density?: StickyDensity;
};
