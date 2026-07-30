import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");

test("実行結果は表形式でクリップボードへコピーする", () => {
  assert.match(runner, /navigator\.clipboard\.writeText\(tsv\)/);
  assert.match(runner, /<Copy size=\{17\} aria-hidden="true" \/>クリップボードにコピー/);
  assert.match(runner, /クリップボードにコピー/);
  assert.doesNotMatch(runner, />表をクリップボードにコピー</);
  assert.match(runner, /ExcelやGoogleスプレッドシートへ貼り付けられます/);
  assert.doesNotMatch(runner, /https:\/\/sheets\.new/);
  assert.doesNotMatch(runner, /Googleスプレッドシートへ出力/);
});
