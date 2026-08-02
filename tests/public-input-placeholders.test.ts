import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");
const dataSourceUi = readFileSync(new URL("../components/data-source-ui.tsx", import.meta.url), "utf8");

test("公開画面はファイル選択前から必要な入力カードをすべて表示する", () => {
  assert.match(runner, /\{orderedInputs\.map\(\(input, cardIndex\) => \{/);
  assert.match(runner, /resourceName="ファイル未選択"/);
  assert.match(runner, /kindLabel="未選択"/);
  assert.match(runner, /afterSettings=\{requiredFields\}/);
  assert.doesNotMatch(runner, /!populatedInputs\.length && <DataSourceEmpty/);
});

test("未選択の入力カードには削除・並べ替え操作を表示しない", () => {
  assert.match(runner, /showActions=\{false\}/);
  assert.match(dataSourceUi, /showActions && <div className="data-source-card-actions"/);
});
