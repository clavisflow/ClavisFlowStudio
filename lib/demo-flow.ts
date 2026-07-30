import type { EffectiveEncoding, PublicFlow } from "./flow-types";
import { visibleSampleTemplates } from "./sample-templates.ts";

const OFFICIAL_UPDATED_AT = "2026-07-30T00:00:00+09:00";

export interface BundledSampleFile {
  name: string;
  url: string;
  encoding: EffectiveEncoding;
  headers: string[];
}

export const OFFICIAL_FLOW_PREFIX = "official-";

const officialFlows = visibleSampleTemplates.map<PublicFlow>((sample) => ({
  publicId: `${OFFICIAL_FLOW_PREFIX}${sample.id}`,
  name: sample.flowName,
  description: sample.description,
  categories: [...sample.categories],
  instruction: sample.instruction,
  version: 1,
  updatedAt: OFFICIAL_UPDATED_AT,
  inputs: sample.files.map((file, index) => ({
    id: `input-${index + 1}`,
    label: file.label,
    tableName: `input_${index + 1}`,
    encoding: "auto",
    delimiter: ",",
    requiredColumns: file.columns.map((column) => ({ ...column })),
  })),
  sql: sample.sql,
  output: sample.output,
  duckdbVersion: "1.32.0",
}));

const officialSampleFiles = Object.fromEntries(
  visibleSampleTemplates.map((sample) => [
    `${OFFICIAL_FLOW_PREFIX}${sample.id}`,
    Object.fromEntries(sample.files.map((file, index) => [
      `input_${index + 1}`,
      { name: file.name, url: file.url, encoding: file.encoding, headers: file.columns.map((column) => column.name) },
    ])),
  ]),
) as Record<string, Record<string, BundledSampleFile>>;

export function getBundledDemo(publicId: string): PublicFlow | undefined {
  return officialFlows.find((flow) => flow.publicId === publicId);
}

export function getBundledSampleFiles(publicId: string): Record<string, BundledSampleFile> | undefined {
  return officialSampleFiles[publicId];
}
