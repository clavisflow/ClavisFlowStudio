import type { InputColumn } from "./flow-types.ts";
import { isIdentifierColumnName } from "./column-semantics.ts";

export function analyzeCsv(text: string, delimiter: string, requestedHeaderRow: number | null) {
  const headerRow = requestedHeaderRow === null ? null : Math.max(1, Math.floor(requestedHeaderRow || 1));
  let rowNumber = 1;
  let value = "";
  let row: string[] = [];
  let quoted = false;
  let headers: string[] | undefined;
  let maximumColumnCount = 0;
  let rowCount = 0;
  const samples: string[][] = [];
  const typeProfiles: ColumnTypeProfile[] = [];

  function commitRow() {
    row.push(value.trim());
    value = "";
    const isEmpty = row.every((cell) => cell === "");
    if (headerRow !== null && rowNumber === headerRow) headers = [...row];
    else if ((headerRow === null || rowNumber > headerRow) && !isEmpty) {
      maximumColumnCount = Math.max(maximumColumnCount, row.length);
      rowCount += 1;
      updateTypeProfiles(typeProfiles, row);
      if (samples.length < 500) samples.push([...row]);
    }
    row = [];
    rowNumber += 1;
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"' && value === "") { quoted = true; continue; }
    if (char === delimiter) { row.push(value.trim()); value = ""; continue; }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && next === "\n") index += 1;
      commitRow();
      continue;
    }
    value += char;
  }
  if (quoted) throw new Error("CSV内の引用符が閉じられていません。");
  if (value || row.length) commitRow();

  if (headerRow === null) {
    if (!maximumColumnCount) throw new Error("データ行を読み取れませんでした。");
    headers = Array.from({ length: maximumColumnCount }, (_, index) => `列${index + 1}`);
  }
  if (!headers || !headers.length || headers.some((header) => !header)) throw new Error("指定したヘッダー行から列名を読み取れません。空の列名がないか確認してください。");
  if (new Set(headers).size !== headers.length) throw new Error("CSVヘッダーに重複する列名があります。");
  return {
    headers,
    rowCount,
    columnTypes: headers.map((header, index) => inferredColumnType(typeProfiles[index], header)),
    sampleValues: Object.fromEntries(headers.map((header, index) => [
      header,
      samples.map((sample) => sample[index] ?? "").filter(Boolean).slice(0, 3),
    ])),
  };
}

type ColumnTypeProfile = {
  populated: boolean;
  boolean: boolean;
  bigint: boolean;
  double: boolean;
  date: boolean;
};

function updateTypeProfiles(profiles: ColumnTypeProfile[], row: string[]) {
  row.forEach((value, index) => {
    if (value === "") return;
    const profile = profiles[index] ??= { populated: false, boolean: true, bigint: true, double: true, date: true };
    profile.populated = true;
    profile.boolean &&= /^(true|false)$/i.test(value);
    profile.bigint &&= /^-?(0|[1-9]\d*)$/.test(value);
    profile.double &&= /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
    profile.date &&= /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value) && !Number.isNaN(Date.parse(value.replaceAll("/", "-")));
  });
}

function inferredColumnType(profile: ColumnTypeProfile | undefined, header: string): InputColumn["type"] {
  if (!profile?.populated) return "VARCHAR";
  if (isIdentifierColumnName(header)) return "VARCHAR";
  if (profile.boolean) return "BOOLEAN";
  if (profile.bigint) return "BIGINT";
  if (profile.double) return "DOUBLE";
  if (profile.date) return "DATE";
  return "VARCHAR";
}
