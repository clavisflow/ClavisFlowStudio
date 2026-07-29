import type { AiSampleSet, FlowDraft, FlowInput } from "./flow-types.ts";
import type { TabularRows } from "./tabular-data.ts";

export function aiSampleSignature(sql: string, inputs: FlowInput[]) {
  const value = JSON.stringify({
    sql: sql.trim(),
    inputs: inputs.map((input) => ({
      tableName: input.tableName,
      columns: input.requiredColumns.map((column) => ({ name: column.name, type: column.type })),
    })),
  });
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
