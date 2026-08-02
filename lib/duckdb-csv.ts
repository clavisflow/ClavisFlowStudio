import type { InputColumn } from "./flow-types.ts";

export function duckDbCsvOptions(headers: string[], headerRow: number | null, delimiter: string) {
  const skip = headerRow === null ? 0 : Math.max(0, headerRow - 1);
  const headerOptions = headerRow === null
    ? `header = false, names = [${headers.map(quoteStringLiteral).join(", ")}]`
    : `header = true, skip = ${skip}`;
  return `${headerOptions}, delim = ${quoteStringLiteral(delimiter)}, strict_mode = false, sample_size = -1, normalize_names = false`;
}

export function duckDbInputProjection(
  headers: string[],
  requiredColumns: InputColumn[],
  columnMapping: Record<string, string>,
) {
  const required = requiredColumns.filter((column) => column.required);
  const requiredByName = new Map(required.map((column) => [column.name, column]));
  const projected = headers.map((header) => {
    const column = requiredByName.get(header);
    return column ? typedColumn(column, columnMapping) : quoteIdentifier(header);
  });
  projected.push(...required.filter((column) => !headers.includes(column.name)).map((column) => typedColumn(column, columnMapping)));
  return projected.join(", ");
}

function typedColumn(column: InputColumn, columnMapping: Record<string, string>) {
  const source = columnMapping[column.name] ?? column.name;
  const expression = column.type === "VARCHAR"
    ? `CAST(${quoteIdentifier(source)} AS VARCHAR)`
    : `TRY_CAST(${quoteIdentifier(source)} AS ${duckDbType(column.type)})`;
  return `${expression} AS ${quoteIdentifier(column.name)}`;
}

function duckDbType(type: InputColumn["type"]) {
  if (type === "BIGINT" || type === "DOUBLE" || type === "DATE" || type === "BOOLEAN") return type;
  return "VARCHAR";
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
