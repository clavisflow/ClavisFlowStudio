import assert from "node:assert/strict";
import test from "node:test";
import { aiSampleSignature, aiSampleTabularRows, isCurrentAiSample } from "../lib/ai-edit-samples.ts";
import type { FlowDraft } from "../lib/flow-types.ts";

const input = {
  id: "sales",
  label: "売上データ",
  tableName: "sales",
  encoding: "auto" as const,
  delimiter: "," as const,
  headerRow: 1,
  requiredColumns: [
    { name: "商品コード", type: "VARCHAR" as const, required: true },
    { name: "売上金額", type: "DOUBLE" as const, required: true },
  ],
};

function draftWithSamples(): FlowDraft {
  const sql = 'SELECT "商品コード", "売上金額" FROM "sales"';
  return {
    name: "売上確認",
    description: "",
    inputs: [input],
    sql,
    output: { fileName: "result.csv", encoding: "utf-8" },
    duckdbVersion: "1.32.0",
    aiSamples: {
      generatedAt: "2026-07-29T00:00:00.000Z",
      definitionSignature: aiSampleSignature(sql, [input]),
      inputs: { sales: [{ 商品コード: "商品001", 売上金額: 1200 }] },
    },
  };
}

test("AIサンプルを入力列順の表データへ変換する", () => {
  const draft = draftWithSamples();
  assert.deepEqual(aiSampleTabularRows(draft.aiSamples!, input), [
    ["商品コード", "売上金額"],
    ["商品001", 1200],
  ]);
  assert.equal(isCurrentAiSample(draft), true);
});

test("SQLまたは入力スキーマが変わったAIサンプルを古いものとして扱う", () => {
  const draft = draftWithSamples();
  assert.equal(isCurrentAiSample({ ...draft, sql: `${draft.sql} ORDER BY "商品コード"` }), false);
  assert.equal(isCurrentAiSample({
    ...draft,
    inputs: [{ ...input, requiredColumns: [...input.requiredColumns, { name: "数量", type: "BIGINT", required: true }] }],
  }), false);
});
