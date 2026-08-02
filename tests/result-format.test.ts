import assert from "node:assert/strict";
import test from "node:test";
import { formatElapsedSeconds, formatResultValue, normalizeResultValue, resultColumnKind } from "../lib/result-format.ts";

test("処理時間を小数付きの秒で表示する", () => {
  assert.equal(formatElapsedSeconds(1234), "1.234秒");
  assert.equal(formatElapsedSeconds(1200), "1.2秒");
  assert.equal(formatElapsedSeconds(1000), "1.0秒");
});

test("DuckDB numeric result types are formatted with grouping separators", () => {
  assert.equal(resultColumnKind("Int64"), "number");
  assert.equal(resultColumnKind("Decimal[18, 2]"), "number");
  assert.equal(formatResultValue("12000", "number"), "12,000");
  assert.equal(formatResultValue("-15000.50", "number"), "-15,000.50");
});

test("DuckDB DATE milliseconds become an unambiguous calendar date", () => {
  assert.equal(resultColumnKind("Date64<MILLISECOND>"), "date");
  assert.equal(normalizeResultValue(1_783_641_600_000, "date"), "2026-07-10");
  assert.equal(formatResultValue("2026-07-10", "date"), "2026/07/10");
});
