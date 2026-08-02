import type { FlowInput } from "./flow-types.ts";

export function shouldRetryFirstHeaderRow(error: unknown, headerRow: number | null) {
  return typeof headerRow === "number" && headerRow !== 1 &&
    error instanceof Error && error.message.includes("CSVヘッダーに重複する列名があります。");
}

export function matchesRequiredHeaders(input: FlowInput, headers: string[]) {
  const required = input.requiredColumns.filter((column) => column.required);
  return required.length > 0 && required.every((column) => headers.includes(column.name));
}
