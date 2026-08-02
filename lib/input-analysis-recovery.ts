import type { CsvEncoding, FileAnalysis, FlowInput } from "./flow-types.ts";
import { matchesRequiredHeaders } from "./header-row-recovery.ts";

export async function analyzeWithInputRecovery(
  analyze: (encoding: CsvEncoding, headerRow: number | null) => Promise<FileAnalysis>,
  input: FlowInput,
  requestedEncoding: CsvEncoding,
  requestedHeaderRow: number | null,
) {
  const candidates = analysisCandidates(requestedEncoding, requestedHeaderRow);
  let firstAnalysis: { analysis: FileAnalysis; encoding: CsvEncoding; headerRow: number | null } | undefined;
  let firstError: unknown;

  for (const candidate of candidates) {
    try {
      const analysis = await analyze(candidate.encoding, candidate.headerRow);
      const result = {
        analysis,
        encoding: candidate.encoding === "auto" ? analysis.detectedEncoding : candidate.encoding,
        headerRow: candidate.headerRow,
      };
      firstAnalysis ??= result;
      if (!input.requiredColumns.some((column) => column.required) || matchesRequiredHeaders(input, analysis.headers)) return result;
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstAnalysis) return firstAnalysis;
  throw firstError ?? new Error("データの解析に失敗しました。");
}

function analysisCandidates(encoding: CsvEncoding, headerRow: number | null) {
  const candidates: Array<{ encoding: CsvEncoding; headerRow: number | null }> = [
    { encoding, headerRow },
    ...(encoding === "auto" ? [] : [{ encoding: "auto" as const, headerRow }]),
    ...(typeof headerRow === "number" && headerRow !== 1 ? [
      { encoding, headerRow: 1 },
      ...(encoding === "auto" ? [] : [{ encoding: "auto" as const, headerRow: 1 }]),
    ] : []),
  ];
  return candidates.filter((candidate, index) => candidates.findIndex((other) =>
    other.encoding === candidate.encoding && other.headerRow === candidate.headerRow) === index);
}
