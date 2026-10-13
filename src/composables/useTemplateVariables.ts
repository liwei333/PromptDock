const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;
const VALID_NAME_PATTERN = /^[\p{L}\p{N}_ ]{1,40}$/u;

export type TemplateVariableErrorCode =
  "INVALID_NAME" | "TOO_MANY_VARIABLES" | "MISSING_VALUE";

export class TemplateVariableError extends Error {
  constructor(
    public readonly code: TemplateVariableErrorCode,
    public readonly variableName?: string,
  ) {
    const messages: Record<TemplateVariableErrorCode, string> = {
      INVALID_NAME: `变量名“${variableName ?? ""}”格式无效`,
      TOO_MANY_VARIABLES: "一个模板最多包含 30 个不同变量",
      MISSING_VALUE: `请填写变量“${variableName ?? ""}”`,
    };
    super(messages[code]);
    this.name = "TemplateVariableError";
  }
}

export function extractTemplateVariables(body: string): string[] {
  const variables: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1].trim();
    if (!VALID_NAME_PATTERN.test(name)) {
      throw new TemplateVariableError("INVALID_NAME", name);
    }
    if (!seen.has(name)) {
      seen.add(name);
      variables.push(name);
      if (variables.length > 30) {
        throw new TemplateVariableError("TOO_MANY_VARIABLES");
      }
    }
  }
  return variables;
}

export function renderTemplatePreview(
  body: string,
  values: Record<string, string>,
): string {
  extractTemplateVariables(body);
  return body.replace(VARIABLE_PATTERN, (placeholder, rawName: string) => {
    const name = rawName.trim();
    const value = values[name];
    return value !== undefined && value.trim() !== "" ? value : placeholder;
  });
}

export function renderTemplate(
  body: string,
  values: Record<string, string>,
): string {
  for (const name of extractTemplateVariables(body)) {
    if (values[name] === undefined || values[name].trim() === "") {
      throw new TemplateVariableError("MISSING_VALUE", name);
    }
  }
  return body.replace(VARIABLE_PATTERN, (_placeholder, rawName: string) => {
    return values[rawName.trim()];
  });
}
