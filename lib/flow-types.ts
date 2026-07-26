export const ENCODINGS = ["auto", "utf-8", "utf-8-bom", "shift_jis", "cp932"] as const;
export type CsvEncoding = (typeof ENCODINGS)[number];
export type EffectiveEncoding = Exclude<CsvEncoding, "auto">;

export interface InputColumn {
  name: string;
  type: "VARCHAR" | "BIGINT" | "DOUBLE" | "DATE" | "BOOLEAN";
  required: boolean;
}

export interface FlowInput {
  id: string;
  label: string;
  tableName: string;
  encoding: CsvEncoding;
  delimiter: "," | "\t" | ";";
  headerRow?: number;
  requiredColumns: InputColumn[];
}

export interface FlowOutput {
  fileName: string;
  encoding: "utf-8-bom" | "utf-8";
  enabled?: boolean;
}

export interface PublicFlow {
  publicId: string;
  name: string;
  description: string;
  instruction?: string;
  version: number;
  inputs: FlowInput[];
  sql: string;
  output: FlowOutput;
  duckdbVersion: string;
}

export interface FlowDraft {
  name: string;
  description: string;
  instruction?: string;
  inputs: FlowInput[];
  sql: string;
  output: FlowOutput;
  duckdbVersion: string;
}

export type FlowStatus = "draft" | "published" | "unpublished";

export interface ManagedFlow extends FlowDraft {
  publicId: string;
  editToken: string;
  status: FlowStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileAnalysis {
  detectedEncoding: EffectiveEncoding;
  effectiveEncoding: EffectiveEncoding;
  headers: string[];
  rowCount: number;
  columnTypes: InputColumn["type"][];
  replacementCount: number;
  warning?: string;
}

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  totalRows: number;
  csv: Uint8Array;
  elapsedMs: number;
}
