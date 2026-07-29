import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import iconv from "iconv-lite";
import { getSampleTemplate, sampleTemplates, visibleSampleTemplates } from "../lib/sample-templates.ts";
import { getBundledDemo, getBundledSampleFiles, OFFICIAL_FLOW_PREFIX } from "../lib/demo-flow.ts";
import { inspectSqlStructure } from "../lib/sql-safety.ts";

test("all sample templates contain safe SQL and the declared number of CSV files", () => {
  assert.equal(sampleTemplates.length, 6);
  assert.equal(visibleSampleTemplates.length, 5);
  for (const sample of sampleTemplates) {
    assert.deepEqual(inspectSqlStructure(sample.sql), { safe: true, errors: [] });
    assert.equal(sample.files.length, Number.parseInt(sample.inputSummary, 10));
  }
});

test("every visible sample is available as an executable official flow", () => {
  for (const sample of visibleSampleTemplates) {
    const publicId = `${OFFICIAL_FLOW_PREFIX}${sample.id}`;
    const flow = getBundledDemo(publicId);
    const files = getBundledSampleFiles(publicId);
    assert.equal(flow?.name, sample.flowName);
    assert.equal(flow?.inputs.length, sample.files.length);
    assert.equal(Object.keys(files ?? {}).length, sample.files.length);
  }
});

test("wide result fixture contains 135 rows and 30 columns without appearing in the sample drawer", async () => {
  const sample = getSampleTemplate("wide-result-display-test");
  assert.ok(sample?.hidden);
  const text = await readFile("public/samples/wide-result-test-utf8.csv", "utf8");
  const lines = text.trim().split(/\r?\n/);
  assert.equal(lines.length - 1, 135);
  assert.equal(lines[0].split(",").length, 30);
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
