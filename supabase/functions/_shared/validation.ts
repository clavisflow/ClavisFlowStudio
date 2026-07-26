import { HttpError } from "./http.ts";

const blocked = new Set(["ALTER","ATTACH","CALL","COPY","CREATE","DELETE","DETACH","DROP","EXPORT","IMPORT","INSERT","INSTALL","LOAD","MERGE","PRAGMA","REPLACE","SET","TRUNCATE","UPDATE","VACUUM"]);
const readers = new Set(["GLOB","HTTPFS","PARQUET_SCAN","POSTGRES_SCAN","READ_BLOB","READ_CSV","READ_CSV_AUTO","READ_JSON","READ_JSON_AUTO","READ_NDJSON","READ_PARQUET","SQLITE_SCAN"]);

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
}
