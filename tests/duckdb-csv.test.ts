import assert from "node:assert/strict";
import test from "node:test";
import { duckDbCsvOptions, duckDbInputProjection } from "../lib/duckdb-csv.ts";

test("公式CSVをDuckDBの非厳格モードで全行判定する", () => {
  const options = duckDbCsvOptions(["間取り"], 1, ",");
  assert.match(options, /header = true, skip = 0/);
  assert.match(options, /delim = ','/);
  assert.match(options, /strict_mode = false/);
  assert.match(options, /sample_size = -1/);
});

test("SQLで使用する入力列は宣言型へ安全に変換する", () => {
  const projection = duckDbInputProjection(
    ["駅名", "所要時間", "備考"],
    [
      { name: "駅名", type: "VARCHAR", required: true },
      { name: "所要時間", type: "BIGINT", required: true },
    ],
    { 駅名: "駅名", 所要時間: "所要時間" },
  );
  assert.equal(projection, 'CAST("駅名" AS VARCHAR) AS "駅名", TRY_CAST("所要時間" AS BIGINT) AS "所要時間", "備考"');
});

test("列割り当て後も入力列の宣言型を適用する", () => {
  const projection = duckDbInputProjection(
    ["元コード", "コード"],
    [{ name: "コード", type: "BIGINT", required: true }],
    { コード: "元コード" },
  );
  assert.equal(projection, '"元コード", TRY_CAST("元コード" AS BIGINT) AS "コード"');
});
