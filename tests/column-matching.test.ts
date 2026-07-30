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

test("部分一致とJaro-Winkler類似度で表記ゆれを要確認候補にする", () => {
  const partial = inferColumnMatches(
    [{ name: "商品コード", type: "VARCHAR", required: true }],
    { ...analysis, headers: ["旧商品コード値"], columnTypes: ["VARCHAR"], sampleValues: { 旧商品コード値: ["A-001"] } },
  );
  assert.equal(partial.商品コード.source, "旧商品コード値");

  const typo = inferColumnMatches(
    [{ name: "店舗コード", type: "VARCHAR", required: true }],
    { ...analysis, headers: ["店舗コド"], columnTypes: ["VARCHAR"], sampleValues: { 店舗コド: ["T01"] } },
  );
  assert.equal(typo.店舗コード.source, "店舗コド");
  assert.notEqual(typo.店舗コード.status, "unmapped");
});

test("汎用的な列の役割を業務データの列名へ自動対応する", () => {
  const matches = inferColumnMatches(
    [
      { name: "照合キー", type: "VARCHAR", required: true },
      { name: "基準金額", type: "DOUBLE", required: true },
      { name: "実績金額", type: "DOUBLE", required: true },
    ],
    {
      ...analysis,
      headers: ["注文番号", "注文金額", "入金額"],
      columnTypes: ["VARCHAR", "DOUBLE", "DOUBLE"],
      sampleValues: { 注文番号: ["O-001"], 注文金額: ["1200"], 入金額: ["1200"] },
    },
  );
  assert.equal(matches.照合キー.source, "注文番号");
  assert.equal(matches.基準金額.source, "注文金額");
  assert.equal(matches.実績金額.source, "入金額");
  assert.ok(Object.values(matches).every((match) => match.status === "automatic"));
});

test("新しい公式処理の日付・置換・形式確認列を別名へ自動対応する", () => {
  const matches = inferColumnMatches(
    [
      { name: "更新日", type: "DATE", required: true },
      { name: "変換前", type: "VARCHAR", required: true },
      { name: "数値項目", type: "VARCHAR", required: true },
      { name: "終了日", type: "DATE", required: true },
    ],
    {
      ...analysis,
      headers: ["更新日時", "旧値", "金額", "完了日"],
      columnTypes: ["DATE", "VARCHAR", "DOUBLE", "DATE"],
      sampleValues: { 更新日時: ["2026-07-01"], 旧値: ["A01"], 金額: ["1200"], 完了日: ["2026-07-10"] },
    },
  );
  assert.equal(matches.更新日.source, "更新日時");
  assert.equal(matches.変換前.source, "旧値");
  assert.equal(matches.数値項目.source, "金額");
  assert.equal(matches.終了日.source, "完了日");
  assert.ok(Object.values(matches).every((match) => match.status === "automatic"));
});

test("表変換・期間確認・欠番検出の役割列を別名へ自動対応する", () => {
  const matches = inferColumnMatches(
    [
      { name: "区分", type: "VARCHAR", required: true },
      { name: "対象キー", type: "VARCHAR", required: true },
      { name: "連番", type: "BIGINT", required: true },
      { name: "値一覧", type: "VARCHAR", required: true },
    ],
    {
      ...analysis,
      headers: ["カテゴリ", "契約番号", "通番", "タグ"],
      columnTypes: ["VARCHAR", "VARCHAR", "BIGINT", "VARCHAR"],
      sampleValues: { カテゴリ: ["A"], 契約番号: ["C-001"], 通番: ["1"], タグ: ["A,B"] },
    },
  );
  assert.equal(matches.区分.source, "カテゴリ");
  assert.equal(matches.対象キー.source, "契約番号");
  assert.equal(matches.連番.source, "通番");
  assert.equal(matches.値一覧.source, "タグ");
  assert.ok(Object.values(matches).every((match) => match.status === "automatic"));
});
