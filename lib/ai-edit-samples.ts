import type { AiSampleSet, FlowDraft, FlowInput } from "./flow-types.ts";
import type { TabularRows } from "./tabular-data.ts";

const missingAiSampleWarning = "編集用AIサンプルを生成できなかったため、SQLだけを使用します。";

export function aiGenerationWarnings(warnings: string[], hasSamples: boolean) {
  const uniqueWarnings = [...new Set(warnings)];
  if (hasSamples || uniqueWarnings.some(isAiSampleGenerationWarning)) return uniqueWarnings;
  return [...uniqueWarnings, missingAiSampleWarning];
}

export function aiSampleEncoding(input: FlowInput) {
  return input.encoding === "auto" ? "utf-8" : input.encoding;
}

function isAiSampleGenerationWarning(warning: string) {
  return /(?:AI|編集用).{0,10}サンプル|サンプル.{0,12}(?:生成|作成|使用)(?:でき|され|し)/u.test(warning);
}

export function aiSampleSignature(sql: string, inputs: FlowInput[]) {
  const value = JSON.stringify({
    sql: sql.trim(),
    inputs: inputSchemaValue(inputs),
  });
  return signatureHash(value);
}

export function inputSchemaSignature(inputs: FlowInput[]) {
  return signatureHash(JSON.stringify(inputSchemaValue(inputs)));
}

function inputSchemaValue(inputs: FlowInput[]) {
  return inputs.map((input) => ({
    tableName: input.tableName,
    columns: input.requiredColumns.map((column) => ({ name: column.name, type: column.type })),
  }));
}

function signatureHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isCurrentAiSample(draft: FlowDraft) {
  const sample = draft.aiSamples;
  if (!sample || sample.definitionSignature !== aiSampleSignature(draft.sql, draft.inputs)) return false;
  return draft.inputs.every((input) => {
    const rows = sample.inputs[input.tableName];
    return Array.isArray(rows) && rows.length > 0 &&
      rows.every((row) => input.requiredColumns.every((column) => Object.hasOwn(row, column.name)));
  });
}

export function aiSampleTabularRows(sample: AiSampleSet, input: FlowInput): TabularRows {
  const sampleRows = sample.inputs[input.tableName];
  if (!sampleRows?.length) throw new Error(`${input.label}のAIサンプルがありません。`);
  const headers = input.requiredColumns.map((column) => column.name);
  return [
    headers,
    ...sampleRows.map((row) => headers.map((header) => row[header])),
  ];
}
