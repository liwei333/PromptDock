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

export type StickySettings = {
  visible: boolean;
  alwaysOnTop: boolean;
  x: number | null;
  y: number | null;
  monitorName: string | null;
  scaleFactor: number | null;
};
