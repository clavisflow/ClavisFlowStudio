import assert from "node:assert/strict";
import test from "node:test";
import { inferColumnMatches, normalizeColumnName } from "../lib/column-matching.ts";
import type { FileAnalysis, InputColumn } from "../lib/flow-types.ts";

const required: InputColumn[] = [
  { name: "売上日", type: "DATE", required: true },
  { name: "売上金額", type: "DOUBLE", required: true },
  { name: "店舗コード", type: "VARCHAR", required: true },
];

const analysis: FileAnalysis = {
  detectedEncoding: "utf-8",
  effectiveEncoding: "utf-8",
  headers: ["販売日", "売上 金額", "店舗ＣＤ"],
  rowCount: 2,
  columnTypes: ["DATE", "DOUBLE", "VARCHAR"],
  sampleValues: {
    販売日: ["2026-07-01", "2026-07-02"],
    "売上 金額": ["1200", "980"],
    店舗ＣＤ: ["T01", "T02"],
  },
  replacementCount: 0,
};

test("列名の正規化で全角半角・空白・記号・大文字小文字を吸収する", () => {
  assert.equal(normalizeColumnName(" Store　Code-01 "), "storecode01");
});

test("完全一致・正規化・別名とデータ型から必要列を推測する", () => {
  const matches = inferColumnMatches(required, analysis);
  assert.equal(matches.売上日.source, "販売日");
  assert.equal(matches.売上金額.source, "売上 金額");
  assert.equal(matches.店舗コード.source, "店舗ＣＤ");
  assert.equal(matches.売上日.status, "automatic");
  assert.equal(matches.売上金額.status, "automatic");
  assert.equal(matches.店舗コード.status, "automatic");
});

test("一致度が低い列は未対応にする", () => {
  const matches = inferColumnMatches(
    [{ name: "商品コード", type: "VARCHAR", required: true }],
    { ...analysis, headers: ["備考"], columnTypes: ["VARCHAR"], sampleValues: { 備考: ["確認済み"] } },
  );
  assert.equal(matches.商品コード.status, "unmapped");
  assert.equal(matches.商品コード.source, undefined);
});
