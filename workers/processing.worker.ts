/// <reference lib="webworker" />

import * as duckdb from "@duckdb/duckdb-wasm";
import { Buffer } from "buffer";
import chardet from "chardet";
import iconv from "iconv-lite";
import type { CsvEncoding, EffectiveEncoding, FileAnalysis, PublicFlow, QueryResult, ResultColumnKind } from "@/lib/flow-types";
import { analyzeCsv } from "@/lib/csv-analysis";
import { inspectSqlStructure } from "@/lib/sql-safety";
import { normalizeResultValue, resultColumnKind } from "@/lib/result-format";
import { buildQueryResult } from "@/lib/query-result";
import { DUCKDB_ASSET_BASE_PATH } from "@/lib/duckdb-assets";

type AnalyzeMessage = { id: string; type: "analyze"; bytes: ArrayBuffer; encoding: CsvEncoding; delimiter: string; headerRow: number | null };
type WarmupMessage = { id: string; type: "warmup" };
type RunMessage = {
  id: string;
  type: "run";
  flow: PublicFlow;
  files: Array<{ tableName: string; bytes: ArrayBuffer; encoding: CsvEncoding; delimiter: string; headerRow: number | null; columnMapping: Record<string, string> }>;
};
type RequestMessage = AnalyzeMessage | WarmupMessage | RunMessage;
type DuckDbEngine = { db: duckdb.AsyncDuckDB; worker: Worker };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_INPUT_BYTES = 250 * 1024 * 1024;
const MAX_OUTPUT_ROWS = 1_000_000;
const ENGINE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let enginePromise: Promise<DuckDbEngine> | undefined;
let engineIdleTimer: ReturnType<typeof setTimeout> | undefined;

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
        sampleValues: structure.sampleValues,
        replacementCount: decoded.replacementCount,
        warning: decoded.warning,
      };
      scope.postMessage({ id: message.id, type: "result", result: analysis });
      return;
    }
    if (message.type === "warmup") {
      await getEngine();
      scheduleEngineRelease();
      scope.postMessage({ id: message.id, type: "result", result: null });
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

function getEngine(): Promise<DuckDbEngine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  if (engineIdleTimer) clearTimeout(engineIdleTimer);
  engineIdleTimer = undefined;
  return enginePromise;
}

async function createEngine(): Promise<DuckDbEngine> {
  const origin = scope.location.origin;
  const bundles: duckdb.DuckDBBundles = {
    mvp: { mainModule: `${origin}${DUCKDB_ASSET_BASE_PATH}/duckdb-mvp.wasm`, mainWorker: `${origin}${DUCKDB_ASSET_BASE_PATH}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${origin}${DUCKDB_ASSET_BASE_PATH}/duckdb-eh.wasm`, mainWorker: `${origin}${DUCKDB_ASSET_BASE_PATH}/duckdb-browser-eh.worker.js` },
  };
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) throw new Error("DuckDB Workerを選択できませんでした。");
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return { db, worker };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

function scheduleEngineRelease() {
  if (engineIdleTimer) clearTimeout(engineIdleTimer);
  engineIdleTimer = setTimeout(() => { void releaseEngine(); }, ENGINE_IDLE_TIMEOUT_MS);
}

async function releaseEngine() {
  const current = enginePromise;
  enginePromise = undefined;
  engineIdleTimer = undefined;
  if (!current) return;
  try {
    const engine = await current;
    try { await engine.db.terminate(); } finally { engine.worker.terminate(); }
  } catch { /* failed initialization has already released its Worker */ }
}

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

async function executeFlow(message: RunMessage): Promise<QueryResult> {
  const safety = inspectSqlStructure(message.flow.sql);
  if (!safety.safe) throw new Error(safety.errors.join(" "));
  if (message.files.length !== message.flow.inputs.length) throw new Error("必要なCSVが揃っていません。");
  const started = performance.now();
  const { db } = await getEngine();
  let connection: duckdb.AsyncDuckDBConnection | undefined;
  const registeredFiles: string[] = [];
  try {
    connection = await db.connect();
    await connection.query("SET autoinstall_known_extensions = false");
    await connection.query("SET autoload_known_extensions = false");

    for (const input of message.flow.inputs) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.tableName)) throw new Error("入力テーブル名が不正です。");
      const file = message.files.find((candidate) => candidate.tableName === input.tableName);
      if (!file) throw new Error(`${input.label}が選択されていません。`);
      const decoded = decodeCsv(new Uint8Array(file.bytes), file.encoding);
      if (decoded.replacementCount || decoded.warning) throw new Error(`${input.label}: ${decoded.warning}`);
      const headerRow = file.headerRow === undefined ? input.headerRow === undefined ? 1 : input.headerRow : file.headerRow;
      const headers = analyzeCsv(decoded.text, file.delimiter, headerRow).headers;
      const requiredColumns = input.requiredColumns.filter((column) => column.required);
      const missing = requiredColumns.filter((column) => {
        const mappedHeader = file.columnMapping[column.name];
        return !mappedHeader || !headers.includes(mappedHeader);
      });
      if (missing.length) throw new Error(`${input.label}に必須列がありません: ${missing.map((column) => column.name).join("、")}`);
      const fileName = `${input.tableName}.csv`;
      await db.registerFileBuffer(fileName, new TextEncoder().encode(decoded.text));
      registeredFiles.push(fileName);
      const delimiter = file.delimiter.replaceAll("'", "''");
      const skip = headerRow === null ? 0 : Math.max(0, headerRow - 1);
      const rawTableName = `__raw_${input.tableName}`;
      const quotedRawTable = quoteIdentifier(rawTableName);
      const headerOptions = headerRow === null
        ? `header = false, names = [${headers.map(quoteStringLiteral).join(", ")}]`
        : `header = true, skip = ${skip}`;
      await connection.query(`CREATE OR REPLACE TEMP VIEW ${quotedRawTable} AS SELECT * FROM read_csv_auto('${fileName}', ${headerOptions}, delim = '${delimiter}', sample_size = -1, normalize_names = false)`);
      const existing = new Set(headers);
      const remappedTargets = new Set(requiredColumns.filter((column) => file.columnMapping[column.name] !== column.name).map((column) => column.name));
      const originalColumns = headers.filter((header) => !remappedTargets.has(header)).map(quoteIdentifier);
      const aliases = requiredColumns
        .filter((column) => file.columnMapping[column.name] !== column.name || !existing.has(column.name))
        .map((column) => `${quoteIdentifier(file.columnMapping[column.name])} AS ${quoteIdentifier(column.name)}`);
      const projection = [...originalColumns, ...aliases].join(", ");
      await connection.query(`CREATE OR REPLACE TEMP VIEW ${quoteIdentifier(input.tableName)} AS SELECT ${projection} FROM ${quotedRawTable}`);
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
    if (registeredFiles.length) {
      try { await db.dropFiles(registeredFiles); } catch { /* best-effort cleanup */ }
    }
    scheduleEngineRelease();
  }
}

function normalizeRow(row: Record<string, unknown>, columns: string[], columnKinds: Record<string, ResultColumnKind>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(columns.map((column) => [column, normalizeResultValue(row[column], columnKinds[column] ?? "text")]));
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export {};
