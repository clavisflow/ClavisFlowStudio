import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

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

test("編集・公開ページの結果保存ボタンは通常ウェイトで左から並べる", () => {
  assert.match(styles, /\.result-preview-actions \{[^}]*justify-content: flex-start/);
  assert.match(styles, /\.result-preview-actions \.button \{[^}]*font-weight: 400/);
  assert.match(styles, /\.runner-output-actions \.button \{[^}]*font-weight: 400/);
});
