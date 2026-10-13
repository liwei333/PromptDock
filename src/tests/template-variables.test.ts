import { describe, expect, it } from "vitest";

import {
  extractTemplateVariables,
  renderTemplate,
  TemplateVariableError,
} from "@/composables/useTemplateVariables";

describe("template variables", () => {
  it("extracts Unicode variables in first-seen order and removes duplicates", () => {
    expect(
      extractTemplateVariables(
        "为 {{ 项目名称 }} 面向 {{target_user}} 编写，项目仍是 {{项目名称}}。",
      ),
    ).toEqual(["项目名称", "target_user"]);
  });

  it("inserts dollar signs, backslashes, and braces as literal text once", () => {
    const output = renderTemplate("路径={{路径}}；值={{值}}", {
      路径: String.raw`C:\\work\\$&`,
      值: "{{不会二次解析}} $` $'",
    });

    expect(output).toBe(
      "路径=" + String.raw`C:\\work\\$&` + "；值={{不会二次解析}} $` $'",
    );
  });

  it("rejects missing values instead of copying unresolved placeholders", () => {
    expect(() =>
      renderTemplate("你好 {{姓名}}，项目 {{项目}}", { 姓名: "小明" }),
    ).toThrow(new TemplateVariableError("MISSING_VALUE", "项目"));
  });

  it("rejects invalid names and more than thirty distinct variables", () => {
    expect(() => extractTemplateVariables("{{bad-name}}")).toThrowError(
      TemplateVariableError,
    );
    const body = Array.from(
      { length: 31 },
      (_, index) => `{{变量${index}}}`,
    ).join(" ");
    expect(() => extractTemplateVariables(body)).toThrow(
      new TemplateVariableError("TOO_MANY_VARIABLES"),
    );
  });
});
