// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Vitest executes this test with Node, while the app tsconfig intentionally excludes Node globals.
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalCss = readFileSync(resolve("src/styles/global.css"), "utf8");

describe("workbench layout contract", () => {
  it("defines a single-row 1024px workbench and viewport-bounded portals", () => {
    expect(globalCss).toMatch(/@media \(max-width: 1100px\)/);
    expect(globalCss).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.workbench-filters\s*\{[^}]*flex-wrap:\s*nowrap/s,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.pd-select-trigger\s*\{[^}]*padding:/s,
    );
    expect(globalCss).toMatch(
      /\.pd-select-content\s*\{[^}]*max-width:\s*min\(\s*var\(--reka-select-content-available-width/s,
    );
    expect(globalCss).toMatch(
      /\.pd-dialog-content\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/s,
    );
  });
});
