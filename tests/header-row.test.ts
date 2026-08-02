import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeCsv } from "../lib/csv-analysis.ts";

test("ヘッダー行を空欄にすると全行をデータとして自動列名を付ける", () => {
  const result = analyzeCsv("10,北海道\r\n20,青森\r\n", ",", null);
  assert.deepEqual(result.headers, ["列1", "列2"]);
  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.columnTypes, ["BIGINT", "VARCHAR"]);
  assert.deepEqual(result.sampleValues, { 列1: ["10", "20"], 列2: ["北海道", "青森"] });
});

test("ヘッダーなしでは最も列数の多いデータ行に合わせて列名を作る", () => {
  const result = analyzeCsv("1,2\n3,4,5\n", ",", null);
  assert.deepEqual(result.headers, ["列1", "列2", "列3"]);
  assert.equal(result.rowCount, 2);
});

test("通常のヘッダー行指定は従来どおり動く", () => {
  const result = analyzeCsv("説明,説明\nコード,都道府県名\n10,北海道\n", ",", 2);
  assert.deepEqual(result.headers, ["コード", "都道府県名"]);
  assert.equal(result.rowCount, 1);
});

test("作成画面と実行画面は範囲内ヘッダーと空欄を扱う", async () => {
  const [editor, runner, worker] = await Promise.all([
    readFile(new URL("../components/flow-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/flow-runner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../workers/processing.worker.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [editor, runner]) {
    assert.match(source, /ヘッダー行（指定範囲内）/);
    assert.match(source, /min=\{0\}/);
    assert.match(source, /placeholder="なし"/);
    assert.match(source, /Number\([^)]*value\) > 0[^\n]*Math\.floor/);
    assert.doesNotMatch(source, /空欄の場合はヘッダーなしとして/);
  }
  assert.match(editor, /hasExplicitA1StartRow\(range\).*headerRow: 1/s);
  assert.match(runner, /resetHeaderRow.*hasExplicitA1StartRow\(patch\.range\)/s);
  assert.match(worker, /header = false, names =/);
});
