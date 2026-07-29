export const MAX_SAMPLE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SAMPLE_FLOW_BYTES = 10 * 1024 * 1024;

export function validateSampleFile(inputId: string, file: File, selected: Record<string, File>) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xlsx", "json"].includes(extension ?? "")) {
    return "サンプルはCSV、Excel（.xlsx）、JSONに対応しています。";
  }
  if (file.size < 1 || file.size > MAX_SAMPLE_FILE_BYTES) {
    return "サンプルは1ファイル5MB以下にしてください。";
  }
  const otherBytes = Object.entries(selected).filter(([id]) => id !== inputId).reduce((sum, [, sample]) => sum + sample.size, 0);
  if (otherBytes + file.size > MAX_SAMPLE_FLOW_BYTES) {
    return "1処理のサンプル合計は10MB以下にしてください。";
  }
}
