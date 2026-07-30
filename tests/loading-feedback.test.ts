import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");
const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");

test("時間のかかる編集操作はボタン内に実行中表示を出す", () => {
  assert.match(editor, /aria-busy=\{aiGenerating\}/);
  assert.match(editor, /LoaderCircle className="spin-icon"[^>]+>[\s\S]*?結果を確認しています/);
  assert.match(editor, /aria-busy=\{saving\}/);
  assert.match(editor, /再確認しています\.\.\./);
});

test("公開処理の実行ボタンは実行中にローダーを表示する", () => {
  assert.match(runner, /aria-busy=\{running\}/);
  assert.match(runner, /running \? <LoaderCircle className="spin-icon"/);
  assert.match(runner, /処理を実行しています\.\.\./);
});

test("公開処理の実行結果は行数と処理時間だけをコンパクトに表示する", () => {
  assert.doesNotMatch(runner, /処理が正常に完了しました/);
  assert.doesNotMatch(runner, /結果プレビュー/);
  assert.doesNotMatch(runner, /runner-result-metrics/);
  assert.match(runner, /className="runner-result-meta">出力 \{result\.totalRows\.toLocaleString\(\)\}行・処理 \{result\.elapsedMs\.toLocaleString\(\)\}ms/);
});
