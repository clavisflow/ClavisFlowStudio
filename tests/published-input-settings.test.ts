import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const types = readFileSync(new URL("../lib/flow-types.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");
const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");

test("編集時のシートと範囲を公開定義へ保存する", () => {
  assert.match(types, /selectedOption\?: string;/);
  assert.match(types, /range\?: string;/);
  assert.match(editor, /\{ \.\.\.candidate, selectedOption: entry\.name, range, headerRow \}/);
  assert.match(editor, /updateInput\(input\.id, \{[\s\S]*?range,[\s\S]*?headerRow: 1/);
});

test("公開画面は保存済みの読み込み設定を初期値として使う", () => {
  assert.match(runner, /encoding: input\.encoding \?\? "auto"/);
  assert.match(runner, /headerRow: input\.headerRow === undefined \? 1 : input\.headerRow/);
  assert.match(runner, /selectedOption: input\.selectedOption/);
  assert.match(runner, /range: input\.range \?\? ""/);
  assert.match(runner, /sheet\.sheet === input\.selectedOption/);
  assert.match(runner, /applyA1Range\(selected\.data as TabularRows, range\)/);
});
