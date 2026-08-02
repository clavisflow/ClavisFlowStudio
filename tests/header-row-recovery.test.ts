import assert from "node:assert/strict";
import test from "node:test";
import { matchesRequiredHeaders, shouldRetryFirstHeaderRow } from "../lib/header-row-recovery.ts";
import type { FlowInput } from "../lib/flow-types.ts";

const input: FlowInput = {
  id: "accidents",
  label: "交通事故",
  tableName: "input_1",
  encoding: "cp932",
  delimiter: ",",
  headerRow: 6,
  requiredColumns: [
    { name: "都道府県コード", type: "VARCHAR", required: true },
    { name: "曜日(発生年月日)", type: "VARCHAR", required: true },
  ],
};

test("保存済みヘッダー行で列名が重複した場合だけ1行目を再確認する", () => {
  const duplicate = new Error("CSVヘッダーに重複する列名があります。");
  assert.equal(shouldRetryFirstHeaderRow(duplicate, 6), true);
  assert.equal(shouldRetryFirstHeaderRow(duplicate, 1), false);
  assert.equal(shouldRetryFirstHeaderRow(new Error("別のエラー"), 6), false);
});

test("1行目に処理の必須列が揃う場合だけヘッダー行を補正する", () => {
  assert.equal(matchesRequiredHeaders(input, ["都道府県コード", "曜日(発生年月日)", "事故内容"]), true);
  assert.equal(matchesRequiredHeaders(input, ["都道府県コード", "都道府県名"]), false);
});
