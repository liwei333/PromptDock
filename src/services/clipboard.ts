import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { promptApi } from "@/api/commands";
import type { CopyStats } from "@/types/prompt";

export class ClipboardWriteError extends Error {
  readonly code = "CLIPBOARD_WRITE_FAILED";
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("无法写入系统剪贴板");
    this.name = "ClipboardWriteError";
    this.cause = cause;
  }
}

type CopyDependencies = {
  writeText: (text: string) => Promise<void>;
  recordSuccessfulCopy: (id: string) => Promise<CopyStats>;
};

export type CopyResult =
  | { status: "copied"; stats: CopyStats }
  | { status: "copied-with-stats-error"; error: unknown };

const defaultDependencies: CopyDependencies = {
  writeText,
  recordSuccessfulCopy: promptApi.recordSuccessfulCopy,
};

export async function copyPromptText(
  prompt: { id: string; text: string },
  dependencies: CopyDependencies = defaultDependencies,
): Promise<CopyResult> {
  try {
    await dependencies.writeText(prompt.text);
  } catch (error) {
    throw new ClipboardWriteError(error);
  }

  try {
    const stats = await dependencies.recordSuccessfulCopy(prompt.id);
    return { status: "copied", stats };
  } catch (error) {
    return { status: "copied-with-stats-error", error };
  }
}
