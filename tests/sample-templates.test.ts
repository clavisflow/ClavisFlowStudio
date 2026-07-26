import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import iconv from "iconv-lite";
import { sampleTemplates } from "../lib/sample-templates.ts";
import { inspectSqlStructure } from "../lib/sql-safety.ts";

test("all sample templates contain safe SQL and the declared number of CSV files", () => {
  assert.equal(sampleTemplates.length, 5);
  for (const sample of sampleTemplates) {
    assert.deepEqual(inspectSqlStructure(sample.sql), { safe: true, errors: [] });
    assert.equal(sample.files.length, Number.parseInt(sample.inputSummary, 10));
  }
});

test("downloadable sample CSV files use their declared encodings", async () => {
  const files = new Map(sampleTemplates.flatMap((sample) => sample.files.map((file) => [file.url, file])));
  for (const file of files.values()) {
    const bytes = await readFile(`public${file.url}`);
    if (file.encoding === "utf-8-bom") assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = file.encoding === "cp932" || file.encoding === "shift_jis" ? iconv.decode(bytes, file.encoding) : bytes.toString("utf8").replace(/^\uFEFF/, "");
    assert.match(text, /,/);
    assert.doesNotMatch(text, /\uFFFD/);
  }
});
