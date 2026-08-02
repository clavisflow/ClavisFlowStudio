import type { FlowCategory } from "./flow-categories.ts";

export const ENCODINGS = ["auto", "utf-8", "utf-8-bom", "shift_jis", "cp932"] as const;
export type CsvEncoding = (typeof ENCODINGS)[number];
export type EffectiveEncoding = Exclude<CsvEncoding, "auto">;
export const OUTPUT_ENCODINGS = ["utf-8", "utf-8-bom", "shift_jis", "cp932"] as const;
export type OutputEncoding = (typeof OUTPUT_ENCODINGS)[number];

export interface InputColumn {
  name: string;
  type: "VARCHAR" | "BIGINT" | "DOUBLE" | "DATE" | "BOOLEAN";
  required: boolean;
}

export interface FlowInput {
  id: string;
  label: string;
  fileName?: string;
  tableName: string;
  encoding: CsvEncoding;
  delimiter: "," | "\t" | ";";
  headerRow?: number | null;
  selectedOption?: string;
  range?: string;
  requiredColumns: InputColumn[];
}

export interface FlowOutput {
  fileName: string;
  encoding: OutputEncoding;
  enabled?: boolean;
}

export type AiSampleValue = string | number | boolean | null;
export type AiSampleRow = Record<string, AiSampleValue>;

export interface AiSampleSet {
  generatedAt: string;
  definitionSignature: string;
  inputs: Record<string, AiSampleRow[]>;
}

export interface PublicFlow {
  publicId: string;
  name: string;
  description: string;
  visibility?: FlowVisibility;
  instruction?: string;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
  categories?: FlowCategory[];
  samples?: FlowSample[];
  inputs: FlowInput[];
  sql: string;
  output: FlowOutput;
  duckdbVersion: string;
}

export interface FlowSample {
  inputId: string;
  fileName: string;
  byteSize: number;
  url: string;
}

export interface FlowDraft {
  name: string;
  description: string;
  visibility?: FlowVisibility;
  categories?: FlowCategory[];
  instruction?: string;
  aiSamples?: AiSampleSet;
  inputs: FlowInput[];
  sql: string;
  output: FlowOutput;
  duckdbVersion: string;
}

export interface PublicFlowSummary {
  publicId: string;
  name: string;
  description: string;
  categories: FlowCategory[];
  updatedAt: string;
  inputs: FlowInput[];
}

export type FlowStatus = "draft" | "published" | "unpublished";
export type FlowVisibility = "public" | "unlisted";

export interface ManagedFlow extends FlowDraft {
  publicId: string;
  editToken: string;
  status: FlowStatus;
  version: number;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileAnalysis {
  detectedEncoding: EffectiveEncoding;
  effectiveEncoding: EffectiveEncoding;
  headers: string[];
  rowCount: number;
  columnTypes: InputColumn["type"][];
  sampleValues: Record<string, string[]>;
  replacementCount: number;
  warning?: string;
}

export interface QueryResult {
  columns: string[];
  columnKinds: Record<string, ResultColumnKind>;
  rows: Array<Record<string, string | number | boolean | null>>;
  totalRows: number;
  csv: Uint8Array;
  elapsedMs: number;
}

export type ResultColumnKind = "text" | "number" | "date" | "datetime" | "boolean";
