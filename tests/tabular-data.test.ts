import assert from "node:assert/strict";
import test from "node:test";
import iconv from "iconv-lite";
import { applyA1Range, hasExplicitA1StartRow, jsonTargets, parseJsonBlob, rowsToCsv } from "../lib/tabular-data.ts";

test("JSON内のオブジェクト配列を読み込み対象として抽出する", () => {
  const targets = jsonTargets({ payload: { items: [{ id: 1, name: "商品A" }, { id: 2, name: "商品B" }] } });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].path, "$.payload.items");
  assert.deepEqual(targets[0].rows, [["id", "name"], [1, "商品A"], [2, "商品B"]]);
});

test("Shift_JISのJSONを自動判定して読み込む", async () => {
  const encoded = iconv.encode(JSON.stringify({ items: [{ name: "東京都", value: 1 }] }), "cp932");
  const parsed = await parseJsonBlob(new Blob([new Uint8Array(encoded)]));
  assert.equal(parsed.encoding, "cp932");
  assert.deepEqual(parsed.value, { items: [{ name: "東京都", value: 1 }] });
});

test("指定されたShift_JISでJSONを読み込む", async () => {
  const encoded = iconv.encode(JSON.stringify([{ name: "大阪府" }]), "cp932");
  const parsed = await parseJsonBlob(new Blob([new Uint8Array(encoded)]), "shift_jis");
  assert.equal(parsed.encoding, "shift_jis");
  assert.deepEqual(parsed.value, [{ name: "大阪府" }]);
});

test("読めないJSONでは形式または文字コードを案内する", async () => {
  await assert.rejects(
    parseJsonBlob(new Blob(["{broken"])),
    /JSONの形式または文字コードを確認してください/,
  );
});

test("A1形式の範囲で表データを切り出す", () => {
  const rows = [["A", "B", "C"], [1, 2, 3], [4, 5, 6]];
  assert.deepEqual(applyA1Range(rows, "B1:C2"), [["B", "C"], [2, 3]]);
});

test("A1範囲の開始行指定を判定する", () => {
  assert.equal(hasExplicitA1StartRow("B6:C57"), true);
  assert.equal(hasExplicitA1StartRow("都道府県!B6:C57"), true);
  assert.equal(hasExplicitA1StartRow("B:C"), false);
  assert.equal(hasExplicitA1StartRow(""), false);
});

test("CSV変換でカンマ・改行・引用符を安全に囲む", () => {
  assert.equal(rowsToCsv([["name", "memo"], ["商品A", "a,\"b\""]]), "name,memo\r\n商品A,\"a,\"\"b\"\"\"\r\n");
});
