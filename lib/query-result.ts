import iconv from "iconv-lite";
import { serializeSafeCsv } from "./csv-security.ts";
import type { FlowOutput, QueryResult, ResultColumnKind } from "./flow-types.ts";

export const MAX_PREVIEW_ROWS = 100;

export function buildQueryResult(
  columns: string[],
  columnKinds: Record<string, ResultColumnKind>,
  records: QueryResult["rows"],
  totalRows: number,
  outputEncoding: FlowOutput["encoding"],
  elapsedMs: number,
): QueryResult {
  const csvText = serializeSafeCsv(columns, records);
  return {
    columns,
    columnKinds,
    rows: records.slice(0, MAX_PREVIEW_ROWS),
    totalRows,
    csv: encodeCsv(csvText, outputEncoding),
    elapsedMs,
  };
}

function encodeCsv(csvText: string, encoding: FlowOutput["encoding"]): Uint8Array {
  if (encoding === "utf-8-bom") return new TextEncoder().encode(`\uFEFF${csvText}`);
  if (encoding === "shift_jis" || encoding === "cp932") return new Uint8Array(iconv.encode(csvText, encoding));
  return new TextEncoder().encode(csvText);
}
