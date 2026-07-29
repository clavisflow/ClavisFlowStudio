export type TabularCell = string | number | boolean | Date | null | undefined;
export type TabularRows = TabularCell[][];

export function rowsToCsv(rows: TabularRows): string {
  return `${rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\r\n")}\r\n`;
}

export function jsonTargets(value: unknown): Array<{ path: string; rows: TabularRows }> {
  const targets: Array<{ path: string; rows: TabularRows }> = [];
  collectJsonTargets(value, "$", targets, 0);
  return targets;
}

export function applyA1Range(rows: TabularRows, range: string): TabularRows {
  const trimmed = range.trim();
  if (!trimmed) return rows;
  const match = /^(?:[^!]+!)?([A-Za-z]+)(\d*)?(?::([A-Za-z]+)?(\d*)?)?$/.exec(trimmed);
  if (!match) throw new Error("範囲は A1:D100 の形式で入力してください。");
  const startColumn = columnNumber(match[1]);
  const startRow = match[2] ? Number(match[2]) - 1 : 0;
  const endColumn = match[3] ? columnNumber(match[3]) + 1 : startColumn + 1;
  const endRow = match[4] ? Number(match[4]) : rows.length;
  if (startRow < 0 || endRow < startRow || endColumn <= startColumn) throw new Error("入力範囲を確認してください。");
  return rows.slice(startRow, endRow).map((row) => row.slice(startColumn, endColumn));
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

function escapeCsvCell(value: TabularCell) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function columnNumber(label: string) {
  let value = 0;
  for (const character of label.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}
