import assert from "node:assert/strict";
import test from "node:test";
import { aiGenerationWarnings, aiSampleEncoding, aiSampleSignature, aiSampleTabularRows, inputSchemaSignature, isCurrentAiSample } from "../lib/ai-edit-samples.ts";
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

test("AIサンプル生成失敗の警告は重複して表示しない", () => {
  const warning = "編集用AIサンプルを生成できなかったため、SQLだけを使用します。";
  assert.deepEqual(aiGenerationWarnings([warning], false), [warning]);
  const detailedWarning = "AIが返したサンプルの行数が不足していたため、編集用AIサンプルを使用できませんでした。SQLだけを使用します。";
  assert.deepEqual(aiGenerationWarnings([detailedWarning], false), [detailedWarning]);
  assert.deepEqual(aiGenerationWarnings(["入力列を確認してください。"], false), ["入力列を確認してください。", warning]);
});

test("AIサンプルは元の入力ファイルと同じ文字コードを使う", () => {
  assert.equal(aiSampleEncoding({ ...input, encoding: "cp932" }), "cp932");
  assert.equal(aiSampleEncoding({ ...input, encoding: "shift_jis" }), "shift_jis");
  assert.equal(aiSampleEncoding({ ...input, encoding: "utf-8-bom" }), "utf-8-bom");
  assert.equal(aiSampleEncoding({ ...input, encoding: "auto" }), "utf-8");
});

test("SQLまたは入力スキーマが変わったAIサンプルを古いものとして扱う", () => {
  const draft = draftWithSamples();
  assert.equal(isCurrentAiSample({ ...draft, sql: `${draft.sql} ORDER BY "商品コード"` }), false);
  assert.equal(isCurrentAiSample({
    ...draft,
    inputs: [{ ...input, requiredColumns: [...input.requiredColumns, { name: "数量", type: "BIGINT", required: true }] }],
  }), false);
});

test("入力スキーマ署名はAIの再判定が必要な変更だけを検出する", () => {
  const signature = inputSchemaSignature([input]);
  assert.equal(inputSchemaSignature([{ ...input, label: "別の表示名", encoding: "cp932" }]), signature);
  assert.equal(inputSchemaSignature([{
    ...input,
    requiredColumns: input.requiredColumns.map((column) => ({ ...column, required: !column.required })),
  }]), signature);
  assert.notEqual(inputSchemaSignature([{ ...input, tableName: "input_2" }]), signature);
  assert.notEqual(inputSchemaSignature([{
    ...input,
    requiredColumns: [{ ...input.requiredColumns[0], name: "新商品コード" }, input.requiredColumns[1]],
  }]), signature);
  assert.notEqual(inputSchemaSignature([{
    ...input,
    requiredColumns: [input.requiredColumns[0], { ...input.requiredColumns[1], type: "BIGINT" }],
  }]), signature);
});
