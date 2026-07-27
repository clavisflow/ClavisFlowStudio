/// <reference lib="webworker" />

import * as duckdb from "@duckdb/duckdb-wasm";
import { Buffer } from "buffer";
import chardet from "chardet";
import iconv from "iconv-lite";
import type { CsvEncoding, EffectiveEncoding, FileAnalysis, InputColumn, PublicFlow, QueryResult, ResultColumnKind } from "@/lib/flow-types";
import { inspectSqlStructure } from "@/lib/sql-safety";
import { normalizeResultValue, resultColumnKind } from "@/lib/result-format";
import { buildQueryResult } from "@/lib/query-result";

type AnalyzeMessage = { id: string; type: "analyze"; bytes: ArrayBuffer; encoding: CsvEncoding; delimiter: string; headerRow: number };
type RunMessage = {
  id: string;
  type: "run";
  flow: PublicFlow;
  files: Array<{ tableName: string; bytes: ArrayBuffer; encoding: CsvEncoding; delimiter: string }>;
};
type RequestMessage = AnalyzeMessage | RunMessage;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_INPUT_BYTES = 250 * 1024 * 1024;
const MAX_OUTPUT_ROWS = 1_000_000;

scope.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  try {
    if (message.type === "analyze") {
      const decoded = decodeCsv(new Uint8Array(message.bytes), message.encoding);
      const structure = analyzeCsv(decoded.text, message.delimiter, message.headerRow);
      const analysis: FileAnalysis = {
        detectedEncoding: decoded.detected,
        effectiveEncoding: decoded.effective,
        headers: structure.headers,
        rowCount: structure.rowCount,
        columnTypes: structure.columnTypes,
        replacementCount: decoded.replacementCount,
        warning: decoded.warning,
      };
      scope.postMessage({ id: message.id, type: "result", result: analysis });
      return;
    }
    scope.postMessage({ id: message.id, type: "progress", phase: "CSVを変換しています" });
    const result = await executeFlow(message);
    scope.postMessage({ id: message.id, type: "result", result }, [result.csv.buffer]);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "処理に失敗しました。";
    scope.postMessage({ id: message.id, type: "error", error: messageText });
  }
};

function decodeCsv(bytes: Uint8Array, requested: CsvEncoding) {
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error("CSVは1ファイル250MB以下にしてください。");
  const detected = detectEncoding(bytes);
  const effective = requested === "auto" ? detected : requested;
  let text: string;
  let roundTripMismatch = false;
  if (effective === "utf-8" || effective === "utf-8-bom") {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("utf-8").decode(bytes); }
  } else {
    const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    text = iconv.decode(source, "cp932");
    const encoded = iconv.encode(text, "cp932");
    roundTripMismatch = encoded.length !== bytes.length || encoded.some((value, index) => value !== bytes[index]);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const replacementCount = [...text].filter((char) => char === "\uFFFD").length;
  const warnings: string[] = [];
  if (replacementCount) warnings.push(`変換できない文字を${replacementCount}件検出しました`);
  if (roundTripMismatch) warnings.push("元データへ戻せない文字またはバイト列があります");
  return { text, detected, effective: normalizeEncoding(effective), replacementCount, warning: warnings.length ? `${warnings.join("。") }。文字コードを確認してください。` : undefined };
}

function detectEncoding(bytes: Uint8Array): EffectiveEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8-bom";
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return "utf-8"; }
  catch { /* continue with statistical detection */ }
  const detected = String(chardet.detect(Buffer.from(bytes)) ?? "").toUpperCase().replaceAll("-", "_");
  if (["SHIFT_JIS", "WINDOWS_31J", "CP932", "SJIS"].includes(detected)) return "cp932";
  return "cp932";
}

function normalizeEncoding(encoding: Exclude<CsvEncoding, "auto">): EffectiveEncoding {
  return encoding;
}

function analyzeCsv(text: string, delimiter: string, requestedHeaderRow: number) {
  const headerRow = Math.max(1, Math.floor(requestedHeaderRow || 1));
  let rowNumber = 1;
  let value = "";
  let row: string[] = [];
  let quoted = false;
  let headers: string[] | undefined;
  let rowCount = 0;
  const samples: string[][] = [];

  function commitRow() {
    row.push(value.trim());
    value = "";
    const isEmpty = row.every((cell) => cell === "");
    if (rowNumber === headerRow) headers = [...row];
    else if (rowNumber > headerRow && !isEmpty) {
      rowCount += 1;
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
  if (!headers || !headers.length || headers.some((header) => !header)) throw new Error("指定したヘッダー行から列名を読み取れません。空の列名がないか確認してください。");
  if (new Set(headers).size !== headers.length) throw new Error("CSVヘッダーに重複する列名があります。");
  return { headers, rowCount, columnTypes: headers.map((_, index) => inferColumnType(samples.map((sample) => sample[index] ?? ""))) };
}

function inferColumnType(values: string[]): InputColumn["type"] {
  const populated = values.filter((value) => value !== "");
  if (!populated.length) return "VARCHAR";
  if (populated.every((value) => /^(true|false)$/i.test(value))) return "BOOLEAN";
  if (populated.every((value) => /^-?(0|[1-9]\d*)$/.test(value))) return "BIGINT";
  if (populated.every((value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) return "DOUBLE";
  if (populated.every((value) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value) && !Number.isNaN(Date.parse(value.replaceAll("/", "-"))))) return "DATE";
  return "VARCHAR";
}

async function executeFlow(message: RunMessage): Promise<QueryResult> {
  const safety = inspectSqlStructure(message.flow.sql);
  if (!safety.safe) throw new Error(safety.errors.join(" "));
  if (message.files.length !== message.flow.inputs.length) throw new Error("必要なCSVが揃っていません。");
  const started = performance.now();
  let db: duckdb.AsyncDuckDB | undefined;
  let engineWorker: Worker | undefined;
  let connection: duckdb.AsyncDuckDBConnection | undefined;
  try {
    const origin = scope.location.origin;
    const bundles: duckdb.DuckDBBundles = {
      mvp: { mainModule: `${origin}/duckdb/duckdb-mvp.wasm`, mainWorker: `${origin}/duckdb/duckdb-browser-mvp.worker.js` },
      eh: { mainModule: `${origin}/duckdb/duckdb-eh.wasm`, mainWorker: `${origin}/duckdb/duckdb-browser-eh.worker.js` },
    };
    const bundle = await duckdb.selectBundle(bundles);
    if (!bundle.mainWorker) throw new Error("DuckDB Workerを選択できませんでした。");
    engineWorker = new Worker(bundle.mainWorker);
    db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), engineWorker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    connection = await db.connect();
    await connection.query("SET autoinstall_known_extensions = false");
    await connection.query("SET autoload_known_extensions = false");

    for (const input of message.flow.inputs) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.tableName)) throw new Error("入力テーブル名が不正です。");
      const file = message.files.find((candidate) => candidate.tableName === input.tableName);
      if (!file) throw new Error(`${input.label}が選択されていません。`);
      const decoded = decodeCsv(new Uint8Array(file.bytes), file.encoding);
      if (decoded.replacementCount || decoded.warning) throw new Error(`${input.label}: ${decoded.warning}`);
      const headerRow = input.headerRow ?? 1;
      const headers = analyzeCsv(decoded.text, file.delimiter, headerRow).headers;
      const missing = input.requiredColumns.filter((column) => column.required && !headers.includes(column.name));
      if (missing.length) throw new Error(`${input.label}に必須列がありません: ${missing.map((column) => column.name).join("、")}`);
      const fileName = `${input.tableName}.csv`;
      await db.registerFileBuffer(fileName, new TextEncoder().encode(decoded.text));
      const delimiter = file.delimiter.replaceAll("'", "''");
      const skip = Math.max(0, headerRow - 1);
      await connection.query(`CREATE VIEW "${input.tableName}" AS SELECT * FROM read_csv_auto('${fileName}', header = true, skip = ${skip}, delim = '${delimiter}', sample_size = -1, normalize_names = false)`);
    }

    scope.postMessage({ id: message.id, type: "progress", phase: "DuckDBでSQLを実行しています" });
    const table = await connection.query(message.flow.sql);
    if (table.numRows > MAX_OUTPUT_ROWS) throw new Error(`結果が${MAX_OUTPUT_ROWS.toLocaleString()}行を超えました。条件を絞ってください。`);
    const columns = table.schema.fields.map((field) => field.name);
    const columnKinds = Object.fromEntries(table.schema.fields.map((field) => [field.name, resultColumnKind(field.type.toString())]));
    const records = table.toArray().map((row) => normalizeRow(row, columns, columnKinds));
    return buildQueryResult(columns, columnKinds, records, table.numRows, message.flow.output.encoding, Math.round(performance.now() - started));
  } finally {
    try { await connection?.close(); } catch { /* best-effort cleanup */ }
    try { await db?.terminate(); } catch { /* best-effort cleanup */ }
    engineWorker?.terminate();
  }
}

function normalizeRow(row: Record<string, unknown>, columns: string[], columnKinds: Record<string, ResultColumnKind>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(columns.map((column) => [column, normalizeResultValue(row[column], columnKinds[column] ?? "text")]));
}

export {};
