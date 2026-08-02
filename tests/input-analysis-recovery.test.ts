import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWithInputRecovery } from "../lib/input-analysis-recovery.ts";
import type { FileAnalysis, FlowInput } from "../lib/flow-types.ts";

const input: FlowInput = {
  id: "accidents",
  label: "交通事故",
  tableName: "input_1",
  encoding: "utf-8",
  delimiter: ",",
  headerRow: 1,
  requiredColumns: [
    { name: "都道府県コード", type: "VARCHAR", required: true },
    { name: "曜日(発生年月日)", type: "VARCHAR", required: true },
  ],
};

function analysis(headers: string[], detectedEncoding: FileAnalysis["detectedEncoding"]): FileAnalysis {
  return { headers, detectedEncoding, effectiveEncoding: detectedEncoding, rowCount: 1, columnTypes: headers.map(() => "VARCHAR"), sampleValues: {}, replacementCount: 0 };
}

test("保存済みUTF-8で失敗したCP932 CSVを自動判定で復旧する", async () => {
  const attempts: string[] = [];
  const result = await analyzeWithInputRecovery(async (encoding) => {
    attempts.push(encoding);
    if (encoding === "utf-8") throw new Error("CSVヘッダーに重複する列名があります。");
    return analysis(["都道府県コード", "曜日(発生年月日)", "事故内容"], "cp932");
  }, input, "utf-8", 1);
  assert.deepEqual(attempts, ["utf-8", "auto"]);
  assert.equal(result.encoding, "cp932");
  assert.equal(result.headerRow, 1);
});

test("解析できても必須列が合わない文字コードは採用しない", async () => {
  const result = await analyzeWithInputRecovery(async (encoding) => encoding === "utf-8"
    ? analysis(["���", "���"], "utf-8")
    : analysis(["都道府県コード", "曜日(発生年月日)"], "cp932"), input, "utf-8", 1);
  assert.equal(result.encoding, "cp932");
  assert.deepEqual(result.analysis.headers, ["都道府県コード", "曜日(発生年月日)"]);
});
