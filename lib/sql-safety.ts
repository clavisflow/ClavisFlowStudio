export interface SqlSafetyResult {
  safe: boolean;
  errors: string[];
}

const forbidden = new Set([
  "ALTER", "ATTACH", "CALL", "COPY", "CREATE", "DELETE", "DETACH", "DROP",
  "EXPORT", "IMPORT", "INSERT", "INSTALL", "LOAD", "MERGE", "PRAGMA", "REPLACE",
  "SET", "TRUNCATE", "UPDATE", "VACUUM",
]);

const externalReaders = new Set([
  "GLOB", "HTTPFS", "PARQUET_SCAN", "POSTGRES_SCAN", "READ_BLOB", "READ_CSV",
  "READ_CSV_AUTO", "READ_JSON", "READ_JSON_AUTO", "READ_NDJSON", "READ_PARQUET",
  "SQLITE_SCAN",
]);

interface Tokens {
  words: string[];
  statements: number;
  balanced: boolean;
  lexicalError?: string;
}

export function inspectSqlStructure(sql: string): SqlSafetyResult {
  const errors: string[] = [];
  if (sql.length > 50_000) errors.push("SQLが長すぎます（上限50,000文字）。");
  const tokens = tokenize(sql);
  if (tokens.lexicalError) errors.push(tokens.lexicalError);
  if (!tokens.balanced) errors.push("括弧の対応が不正です。");
  if (tokens.statements !== 1) errors.push("単一のSQL文だけを指定してください。");
  const first = tokens.words[0];
  if (first !== "SELECT" && first !== "WITH") errors.push("SELECTまたはWITHで始まる読取専用SQLだけを指定できます。");
  const denied = tokens.words.find((word) => forbidden.has(word));
  if (denied) errors.push(`禁止されたSQL要素が含まれています: ${denied}`);
  const external = tokens.words.find((word) => externalReaders.has(word));
  if (external) errors.push(`外部ファイル・URLを参照する関数は使用できません: ${external}`);
  return { safe: errors.length === 0, errors };
}

function tokenize(sql: string): Tokens {
  const words: string[] = [];
  let word = "";
  let depth = 0;
  let statements = 0;
  let hasContent = false;
  let statementEnded = false;
  let state: "normal" | "single" | "double" | "line-comment" | "block-comment" = "normal";

  const flush = () => {
    if (word) {
      words.push(word.toUpperCase());
      word = "";
      hasContent = true;
      if (statementEnded) statements += 1;
      statementEnded = false;
    }
  };

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (state === "line-comment") {
      if (char === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") { state = "normal"; i += 1; }
      continue;
    }
    if (state === "single") {
      if (char === "'" && next === "'") i += 1;
      else if (char === "'") state = "normal";
      continue;
    }
    if (state === "double") {
      if (char === '"' && next === '"') i += 1;
      else if (char === '"') state = "normal";
      continue;
    }
    if (char === "-" && next === "-") { flush(); state = "line-comment"; i += 1; continue; }
    if (char === "/" && next === "*") { flush(); state = "block-comment"; i += 1; continue; }
    if (char === "'") { flush(); state = "single"; hasContent = true; continue; }
    if (char === '"') { flush(); state = "double"; hasContent = true; continue; }
    if (/[A-Za-z_]/.test(char)) { word += char; continue; }
    if (/[0-9]/.test(char) && word) { word += char; continue; }
    flush();
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return { words, statements, balanced: false };
    if (char === ";") {
      if (hasContent) { statements += 1; hasContent = false; }
      statementEnded = false;
    } else if (!/\s/.test(char)) {
      if (statements > 0) statementEnded = true;
      hasContent = true;
    }
  }
  flush();
  if (state === "single" || state === "double" || state === "block-comment") {
    return { words, statements, balanced: depth === 0, lexicalError: "文字列・識別子またはコメントが閉じられていません。" };
  }
  if (hasContent) statements += 1;
  return { words, statements, balanced: depth === 0 };
}
