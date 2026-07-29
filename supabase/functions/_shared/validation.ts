import { HttpError } from "./errors.ts";

const blocked = new Set(["ALTER","ATTACH","CALL","COPY","CREATE","DELETE","DETACH","DROP","EXPORT","IMPORT","INSERT","INSTALL","LOAD","MERGE","PRAGMA","REPLACE","SET","TRUNCATE","UPDATE","VACUUM"]);
const readers = new Set(["GLOB","HTTPFS","PARQUET_SCAN","POSTGRES_SCAN","READ_BLOB","READ_CSV","READ_CSV_AUTO","READ_JSON","READ_JSON_AUTO","READ_NDJSON","READ_PARQUET","SQLITE_SCAN"]);
const categories = new Set(["整形", "集計", "結合", "変換", "チェック", "抽出"]);
const visibilities = new Set(["public", "unlisted"]);
export type FlowVisibility = "public" | "unlisted";

export function assertSafeSql(sql: unknown): asserts sql is string {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 50_000) throw new HttpError(400, "SQLが空か、長すぎます。");
  const words: string[] = [];
  let word = "", depth = 0, statements = 0, content = false;
  let state: "normal" | "single" | "double" | "line" | "block" = "normal";
  const flush = () => { if (word) { words.push(word.toUpperCase()); word = ""; content = true; } };
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i + 1];
    if (state === "line") { if (c === "\n") state = "normal"; continue; }
    if (state === "block") { if (c === "*" && n === "/") { state = "normal"; i++; } continue; }
    if (state === "single") { if (c === "'" && n === "'") i++; else if (c === "'") state = "normal"; continue; }
    if (state === "double") { if (c === '"' && n === '"') i++; else if (c === '"') state = "normal"; continue; }
    if (c === "-" && n === "-") { flush(); state = "line"; i++; continue; }
    if (c === "/" && n === "*") { flush(); state = "block"; i++; continue; }
    if (c === "'") { flush(); state = "single"; content = true; continue; }
    if (c === '"') { flush(); state = "double"; content = true; continue; }
    if (/[A-Za-z_]/.test(c) || (word && /[0-9]/.test(c))) { word += c; continue; }
    flush();
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && content) { statements++; content = false; }
    else if (!/\s/.test(c)) content = true;
  }
  flush();
  if (content) statements++;
  const first = words[0];
  const denied = words.find((x) => blocked.has(x) || readers.has(x));
  if (state === "single" || state === "double" || state === "block" || depth !== 0 || statements !== 1 || (first !== "SELECT" && first !== "WITH") || denied) {
    throw new HttpError(400, denied ? `禁止されたSQL要素が含まれています: ${denied}` : "単一の読取専用SELECT文だけを指定できます。");
  }
}

export function assertDefinition(body: Record<string, unknown>) {
  assertSafeSql(body.sql);
  if (!Array.isArray(body.inputs) || body.inputs.length < 1 || body.inputs.length > 2) throw new HttpError(400, "入力定義は1～2件必要です。");
  if (!body.output || typeof body.output !== "object") throw new HttpError(400, "出力定義が必要です。");
  if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > categories.size ||
    new Set(body.categories).size !== body.categories.length ||
    body.categories.some((category) => typeof category !== "string" || !categories.has(category))) {
    throw new HttpError(400, "カテゴリを1つ以上選択してください。");
  }
  assertAiSamples(body.aiSamples);
  flowVisibility(body.visibility);
}

export function flowVisibility(value: unknown, fallback: FlowVisibility = "public"): FlowVisibility {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !visibilities.has(value)) throw new HttpError(400, "公開範囲が不正です。");
  return value as FlowVisibility;
}

function assertAiSamples(value: unknown) {
  if (value === undefined || value === null) return;
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 250_000) {
    throw new HttpError(400, "編集用AIサンプルが不正です。");
  }
  const sample = value as Record<string, unknown>;
  if (typeof sample.generatedAt !== "string" || sample.generatedAt.length > 50 ||
    typeof sample.definitionSignature !== "string" || sample.definitionSignature.length > 128 ||
    !sample.inputs || typeof sample.inputs !== "object" || Array.isArray(sample.inputs)) {
    throw new HttpError(400, "編集用AIサンプルが不正です。");
  }
  const inputs = Object.entries(sample.inputs as Record<string, unknown>);
  if (!inputs.length || inputs.length > 10) throw new HttpError(400, "編集用AIサンプルの入力数が不正です。");
  for (const [tableName, rows] of inputs) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(tableName) || !Array.isArray(rows) || rows.length < 1 || rows.length > 20) {
      throw new HttpError(400, "編集用AIサンプルの行定義が不正です。");
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length > 300) {
        throw new HttpError(400, "編集用AIサンプルの列定義が不正です。");
      }
      for (const [column, cell] of Object.entries(row as Record<string, unknown>)) {
        if (!column || column.length > 256 || !validAiSampleCell(cell)) {
          throw new HttpError(400, "編集用AIサンプルの値が不正です。");
        }
      }
    }
  }
}

function validAiSampleCell(value: unknown) {
  return value === null || typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value) ||
    typeof value === "string" && value.length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
