export type ImportMode = "merge" | "replace";

export type ImportPreviewSummary = {
  promptCount: number;
  categoryCount: number;
  idConflicts: number;
  categoriesAdded: number;
  invalidRecords: number;
  sourceVersion: number;
};

export type ImportPreview = {
  token: string;
  summary: ImportPreviewSummary;
};

export type ExportResult = {
  cancelled: boolean;
  path: string | null;
  promptCount: number;
  categoryCount: number;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  duplicated: number;
  categoriesAdded: number;
  safetyBackupPath: string | null;
};
