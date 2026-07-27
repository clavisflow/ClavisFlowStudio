import assert from "node:assert/strict";
import test from "node:test";
import iconv from "iconv-lite";
import { buildQueryResult, MAX_PREVIEW_ROWS } from "../lib/query-result.ts";

test("preview is limited to 100 rows while downloadable CSV contains every row", () => {
  const records = Array.from({ length: 135 }, (_, index) => ({
    id: `ROW-${String(index + 1).padStart(3, "0")}`,
    amount: (index + 1) * 1000,
  }));
  const result = buildQueryResult(
    ["id", "amount"],
    { id: "text", amount: "number" },
    records,
    records.length,
    "utf-8-bom",
    123,
  );

  assert.equal(result.rows.length, MAX_PREVIEW_ROWS);
  assert.equal(result.totalRows, 135);
  assert.deepEqual([...result.csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(result.csv.subarray(3));
  assert.equal(csv.trim().split(/\r?\n/).length, 136);
  assert.match(csv, /ROW-135,135000/);
});

test("downloadable CSV supports UTF-8, UTF-8 BOM, Shift-JIS, and CP932", () => {
  const encodings = ["utf-8", "utf-8-bom", "shift_jis", "cp932"] as const;
  for (const encoding of encodings) {
    const result = buildQueryResult(["商品名"], { 商品名: "text" }, [{ 商品名: "りんご" }], 1, encoding, 1);
    const decoded = encoding === "shift_jis" || encoding === "cp932"
      ? iconv.decode(result.csv, encoding)
      : new TextDecoder().decode(result.csv).replace(/^\uFEFF/, "");
    assert.match(decoded, /商品名/);
    assert.match(decoded, /りんご/);
  }
});
