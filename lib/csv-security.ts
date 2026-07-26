export type CsvValue = string | number | boolean | null;

export function neutralizeFormula(value: string): string {
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function serializeSafeCsv(columns: string[], rows: Array<Record<string, CsvValue>>): string {
  const escape = (input: CsvValue | string) => {
    const value = neutralizeFormula(input == null ? "" : String(input));
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  };
  return `${columns.map(escape).join(",")}\r\n${rows.map((row) => columns.map((column) => escape(row[column])).join(",")).join("\r\n")}\r\n`;
}
