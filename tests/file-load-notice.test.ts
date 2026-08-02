import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");
const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("編集画面はファイル解析成功後にトースト通知を表示する", () => {
  assert.match(editor, /const analysisResults = await Promise\.all/);
  assert.match(editor, /showNotice\(`\$\{validFiles\.map\(\(file\) => file\.name\)\.join\("、"\)\}を読み込んでいます…`, "loading", false\)/);
  assert.match(editor, /showNotice\(`\$\{loadedFiles\.join\("、"\)\}を読み込みました。`, "success"\)/);
  assert.match(editor, /portal-toast \$\{noticeKind\}/);
});

test("公開実行画面はファイル解析成功後にトースト通知を表示する", () => {
  assert.match(runner, /const analysisResults = await Promise\.all/);
  assert.match(runner, /showNotice\(`\$\{selectedFiles\.map\(\(file\) => file\.name\)\.join\("、"\)\}を読み込んでいます…`, "loading", false\)/);
  assert.match(runner, /showNotice\(`\$\{loadedFiles\.map\(\(file\) => file\.name\)\.join\("、"\)\}を読み込みました。`, "success"\)/);
  assert.match(runner, /portal-toast \$\{noticeKind\}/);
});

test("成功トーストは読みやすい緑色と14pxの文字で表示する", () => {
  assert.match(styles, /\.portal-toast\.success \{ background: #176444; \}/);
  assert.match(styles, /\.portal-toast \{[^}]*position: fixed;[^}]*font-size: 14px;[^}]*line-height: 1\.5;/);
});

test("JSONは元ファイルから検出した文字コードをドロップダウンへ反映する", () => {
  assert.match(editor, /encoding: prepared\.sourceEncoding \?\? "auto"/);
  assert.match(editor, /sourceEncoding: parsed\.encoding/);
  assert.match(runner, /"json", parsed\.encoding/);
});
