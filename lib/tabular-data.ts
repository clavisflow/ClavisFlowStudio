import type { CsvEncoding } from "./flow-types";

export type TabularCell = string | number | boolean | Date | null | undefined;
export type TabularRows = TabularCell[][];

const A1_RANGE_PATTERN = /^(?:[^!]+!)?([A-Za-z]+)(\d*)?(?::([A-Za-z]+)?(\d*)?)?$/;

export function rowsToCsv(rows: TabularRows): string {
  return `${rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\r\n")}\r\n`;
}

export function jsonTargets(value: unknown): Array<{ path: string; rows: TabularRows }> {
  const targets: Array<{ path: string; rows: TabularRows }> = [];
  collectJsonTargets(value, "$", targets, 0);
  return targets;
}

export async function parseJsonBlob(
  source: Blob,
  encoding: CsvEncoding = "auto",
): Promise<{ value: unknown; encoding: Exclude<CsvEncoding, "auto"> }> {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const encodings: Array<Exclude<CsvEncoding, "auto">> = encoding === "auto"
    ? [hasUtf8Bom(bytes) ? "utf-8-bom" : "utf-8", "cp932"]
    : [encoding];
  let lastError: unknown;

  for (const candidate of encodings) {
    try {
      const text = await decodeJsonBytes(bytes, candidate);
      return {
        value: JSON.parse(text.replace(/^\uFEFF/, "")) as unknown,
        encoding: candidate,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : "不明なエラー";
  const encodingLabel = encoding === "auto" ? "UTF-8またはShift_JIS" : encodingName(encoding);
  throw new Error(`JSONを${encodingLabel}として読み込めませんでした。JSONの形式または文字コードを確認してください。（${reason}）`);
}

export function applyA1Range(rows: TabularRows, range: string): TabularRows {
  const trimmed = range.trim();
  if (!trimmed) return rows;
  const match = A1_RANGE_PATTERN.exec(trimmed);
  if (!match) throw new Error("範囲は A1:D100 の形式で入力してください。");
  const startColumn = columnNumber(match[1]);
  const startRow = match[2] ? Number(match[2]) - 1 : 0;
  const endColumn = match[3] ? columnNumber(match[3]) + 1 : startColumn + 1;
  const endRow = match[4] ? Number(match[4]) : rows.length;
  if (startRow < 0 || endRow < startRow || endColumn <= startColumn) throw new Error("入力範囲を確認してください。");
  return rows.slice(startRow, endRow).map((row) => row.slice(startColumn, endColumn));
}

export function hasExplicitA1StartRow(range: string) {
  const match = A1_RANGE_PATTERN.exec(range.trim());
  return Boolean(match?.[2]);
}

function collectJsonTargets(value: unknown, path: string, targets: Array<{ path: string; rows: TabularRows }>, depth: number) {
  if (depth > 4) return;
  if (Array.isArray(value) && value.length && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    const objects = value as Array<Record<string, unknown>>;
    const headers = [...new Set(objects.flatMap((item) => Object.keys(item)))];
    targets.push({
      path,
      rows: [headers, ...objects.map((item) => headers.map((header) => primitiveValue(item[header])))],
    });
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectJsonTargets(child, `${path}.${key}`, targets, depth + 1);
  }
}

function primitiveValue(value: unknown): TabularCell {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

async function decodeJsonBytes(bytes: Uint8Array, encoding: Exclude<CsvEncoding, "auto">) {
  if (encoding === "utf-8" || encoding === "utf-8-bom") {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  const { default: iconv } = await import("iconv-lite");
  return iconv.decode(bytes, "cp932");
}

function hasUtf8Bom(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function encodingName(encoding: Exclude<CsvEncoding, "auto">) {
  if (encoding === "shift_jis" || encoding === "cp932") return "Shift_JIS";
  return "UTF-8";
}

function escapeCsvCell(value: TabularCell) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function columnNumber(label: string) {
  let value = 0;
  for (const character of label.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}
