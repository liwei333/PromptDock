import { describe, expect, it, vi } from "vitest";

import { copyPromptText, ClipboardWriteError } from "@/services/clipboard";

describe("copyPromptText", () => {
  it("records usage only after the native clipboard succeeds", async () => {
    const events: string[] = [];
    const result = await copyPromptText(
      { id: "prompt-1", text: "完整正文" },
      {
        writeText: async () => {
          events.push("clipboard");
        },
        recordSuccessfulCopy: async () => {
          events.push("count");
          return { copyCount: 1, lastCopiedAt: 123 };
        },
      },
    );

    expect(events).toEqual(["clipboard", "count"]);
    expect(result.status).toBe("copied");
  });

  it("does not record usage when the native clipboard fails", async () => {
    const record = vi.fn();

    await expect(
      copyPromptText(
        { id: "prompt-1", text: "完整正文" },
        {
          writeText: async () => {
            throw new Error("clipboard denied");
          },
          recordSuccessfulCopy: record,
        },
      ),
    ).rejects.toBeInstanceOf(ClipboardWriteError);
    expect(record).not.toHaveBeenCalled();
  });

  it("reports copied-with-stats-error when clipboard worked but counting failed", async () => {
    const result = await copyPromptText(
      { id: "prompt-1", text: "完整正文" },
      {
        writeText: async () => undefined,
        recordSuccessfulCopy: async () => {
          throw new Error("database busy");
        },
      },
    );

    expect(result.status).toBe("copied-with-stats-error");
    if (result.status === "copied-with-stats-error") {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
