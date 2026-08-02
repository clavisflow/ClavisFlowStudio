import type { FlowInput } from "./flow-types.ts";

type NamedFile = { name: string };
type ReadableNamedFile = NamedFile & { file: File };

const HEADER_PREFIX_BYTES = 1024 * 1024;

export async function assignFilesToInputs<T extends ReadableNamedFile>(inputs: FlowInput[], files: T[]) {
  const remainingInputs = [...inputs];
  const assignments: Array<{ input: FlowInput; file: T }> = [];
  const unassignedFiles: T[] = [];

  for (const file of files) {
    if (!remainingInputs.length) {
      unassignedFiles.push(file);
      continue;
    }
    const schemaMatch = await matchCsvInput(file, remainingInputs);
    const fileKey = normalizedFileKey(file.name);
    const namedIndex = remainingInputs.findIndex((input) =>
      [input.fileName, input.label].some((candidate) => candidate && normalizedFileKey(candidate) === fileKey));
    const matchedIndex = schemaMatch
      ? remainingInputs.findIndex((input) => input.id === schemaMatch.id)
      : namedIndex;
    const input = remainingInputs.splice(matchedIndex >= 0 ? matchedIndex : 0, 1)[0];
    assignments.push({ input, file });
  }

  return { assignments, unassignedFiles };
}

export function assignNamedFilesToInputs<T extends NamedFile>(inputs: FlowInput[], files: T[]) {
  const remainingInputs = [...inputs];
  const assignments: Array<{ input: FlowInput; file: T }> = [];
  const unassignedFiles: T[] = [];

  files.forEach((file) => {
    if (!remainingInputs.length) {
      unassignedFiles.push(file);
      return;
    }
    const fileKey = normalizedFileKey(file.name);
    const matchedIndex = remainingInputs.findIndex((input) =>
      [input.fileName, input.label].some((candidate) => candidate && normalizedFileKey(candidate) === fileKey));
    const input = remainingInputs.splice(matchedIndex >= 0 ? matchedIndex : 0, 1)[0];
    assignments.push({ input, file });
  });

  return { assignments, unassignedFiles };
}

function normalizedFileKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\.(csv|xlsx|json)$/i, "");
}

async function matchCsvInput(file: ReadableNamedFile, inputs: FlowInput[]) {
  if (!/\.csv$/i.test(file.name) || inputs.length < 2) return undefined;
  const bytes = new Uint8Array(await file.file.slice(0, HEADER_PREFIX_BYTES).arrayBuffer());
  const decoded = new Map<string, string>();
  const matches = inputs.flatMap((input) => {
    const required = input.requiredColumns.filter((column) => column.required);
    const headerRow = input.headerRow === undefined ? 1 : input.headerRow;
    if (!required.length || headerRow === null) return [];
    const encoding = effectivePrefixEncoding(bytes, input.encoding);
    let text = decoded.get(encoding);
    if (text === undefined) {
      text = new TextDecoder(encoding).decode(bytes);
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      decoded.set(encoding, text);
    }
    const configuredHeaders = csvRecordAt(text, input.delimiter, headerRow);
    const firstHeaders = headerRow === 1 ? configuredHeaders : csvRecordAt(text, input.delimiter, 1);
    const headers = [configuredHeaders, firstHeaders].find((candidate) =>
      candidate && required.every((column) => candidate.includes(column.name)));
    return headers ? [{ input, score: required.length }] : [];
  });
  matches.sort((left, right) => right.score - left.score);
  return matches[0]?.input;
}

function effectivePrefixEncoding(bytes: Uint8Array, requested: FlowInput["encoding"]): "utf-8" | "shift_jis" {
  if (requested === "utf-8" || requested === "utf-8-bom") return "utf-8";
  if (requested === "shift_jis" || requested === "cp932") return "shift_jis";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "shift_jis";
  }
}

export function csvRecordAt(text: string, delimiter: string, requestedRow: number) {
  let rowNumber = 1;
  let value = "";
  let row: string[] = [];
  let quoted = false;
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
      row.push(value.trim());
      if (rowNumber === requestedRow) return row;
      rowNumber += 1;
      value = "";
      row = [];
      continue;
    }
    value += char;
  }
  if (rowNumber === requestedRow && (value || row.length)) return [...row, value.trim()];
  return undefined;
}
