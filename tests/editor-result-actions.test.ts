import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");

test("編集時の結果保存は公開実行と同じ形式を選べる", () => {
  assert.match(editor, />CSVで保存</);
  assert.match(editor, />Excelで保存</);
  assert.match(editor, />JSONで保存</);
  assert.match(editor, />クリップボードにコピー</);
  assert.doesNotMatch(editor, />結果をダウンロード</);
});

test("編集時のExcel・JSON・コピーはプレビュー結果から生成する", () => {
  assert.match(editor, /writeExcelFile\(rows\)\.toFile/);
  assert.match(editor, /JSON\.stringify\(preview\.rows, null, 2\)/);
  assert.match(editor, /navigator\.clipboard\.writeText\(tsv\)/);
});
