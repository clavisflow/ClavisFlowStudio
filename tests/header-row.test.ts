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

test("列型は先頭500行だけでなく全データ行から判定する", () => {
  const numericRows = Array.from({ length: 500 }, (_, index) => String(index + 1));
  const result = analyzeCsv(["所要時間", ...numericRows, "30分～60分"].join("\n"), ",", 1);
  assert.equal(result.columnTypes[0], "VARCHAR");
  assert.deepEqual(result.sampleValues.所要時間.slice(0, 3), ["1", "2", "3"]);
});

test("番号やコードは数字だけでも識別子として文字列にする", () => {
  const result = analyzeCsv(
    "corporationNo,企業名,落札件数,落札総額\n7010001008844,株式会社日立製作所,6,18621179823\n",
    ",",
    1,
  );
  assert.deepEqual(result.columnTypes, ["VARCHAR", "VARCHAR", "BIGINT", "BIGINT"]);
});

test("作成画面と実行画面は範囲内ヘッダーと空欄を扱う", async () => {
  const [editor, runner, duckDbCsv] = await Promise.all([
    readFile(new URL("../components/flow-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/flow-runner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/duckdb-csv.ts", import.meta.url), "utf8"),
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
  assert.match(duckDbCsv, /header = false, names =/);
});
