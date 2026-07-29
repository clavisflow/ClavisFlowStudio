import assert from "node:assert/strict";
import test from "node:test";
import { applyA1Range, jsonTargets, rowsToCsv } from "../lib/tabular-data.ts";

test("JSON内のオブジェクト配列を読み込み対象として抽出する", () => {
  const targets = jsonTargets({ payload: { items: [{ id: 1, name: "商品A" }, { id: 2, name: "商品B" }] } });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].path, "$.payload.items");
  assert.deepEqual(targets[0].rows, [["id", "name"], [1, "商品A"], [2, "商品B"]]);
});

test("A1形式の範囲で表データを切り出す", () => {
  const rows = [["A", "B", "C"], [1, 2, 3], [4, 5, 6]];
  assert.deepEqual(applyA1Range(rows, "B1:C2"), [["B", "C"], [2, 3]]);
});

test("CSV変換でカンマ・改行・引用符を安全に囲む", () => {
  assert.equal(rowsToCsv([["name", "memo"], ["商品A", "a,\"b\""]]), "name,memo\r\n商品A,\"a,\"\"b\"\"\"\r\n");
});
