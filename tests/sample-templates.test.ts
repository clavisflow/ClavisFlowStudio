import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import iconv from "iconv-lite";
import { getSampleTemplate, sampleTemplates, visibleSampleTemplates } from "../lib/sample-templates.ts";
import { getBundledDemo, getBundledSampleFiles, OFFICIAL_FLOW_PREFIX } from "../lib/demo-flow.ts";
import { loadPublicFlow } from "../lib/flow-store.ts";
import { inspectSqlStructure } from "../lib/sql-safety.ts";

test("all sample templates contain safe SQL", () => {
  assert.equal(sampleTemplates.length, 26);
  assert.equal(visibleSampleTemplates.length, 25);
  for (const sample of sampleTemplates) {
    assert.deepEqual(inspectSqlStructure(sample.sql), { safe: true, errors: [] });
  }
});

test("every visible sample is available as an executable official flow", () => {
  for (const sample of visibleSampleTemplates) {
    const publicId = `${OFFICIAL_FLOW_PREFIX}${sample.id}`;
    const flow = getBundledDemo(publicId);
    const files = getBundledSampleFiles(publicId);
    assert.equal(flow?.name, sample.flowName);
    assert.deepEqual(flow?.categories, sample.categories);
    assert.equal(flow?.inputs.length, sample.files.length);
    assert.equal(Object.keys(files ?? {}).length, sample.files.length);
    assert.deepEqual(flow?.inputs.map((input) => input.requiredColumns), sample.files.map((file) => file.columns));
  }
});

test("公式処理は外部公開APIを待たずに内蔵定義から読み込める", async () => {
  const flow = await loadPublicFlow("official-latest-record-by-key");
  assert.equal(flow.publicId, "official-latest-record-by-key");
  assert.ok(flow.name.trim());
});

test("削除した旧請求入金デモを同梱処理として復元しない", () => {
  assert.equal(getBundledDemo("invoice-payment-check"), undefined);
  assert.equal(getBundledSampleFiles("invoice-payment-check"), undefined);
});

test("公式処理を内容に応じて複数カテゴリへ分類する", () => {
  assert.deepEqual(getSampleTemplate("invoice-payment")?.categories, ["結合", "チェック"]);
  assert.deepEqual(getSampleTemplate("sales-by-product")?.categories, ["集計"]);
  assert.deepEqual(getSampleTemplate("attach-product-master")?.categories, ["結合"]);
  assert.deepEqual(getSampleTemplate("low-inventory")?.categories, ["抽出", "チェック"]);
  assert.deepEqual(getSampleTemplate("customer-data-check")?.categories, ["チェック"]);
});

test("既存の公式IDを保ったまま先頭5件を提供する", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(0, 5).map((sample) => sample.id),
    [
      "invoice-payment",
      "sales-by-product",
      "attach-product-master",
      "low-inventory",
      "customer-data-check",
    ],
  );
});

test("汎用的な公式処理を10件追加し、内容に応じて複数カテゴリへ分類する", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(5, 15).map((sample) => [sample.id, sample.categories]),
    [
      ["latest-record-by-key", ["整形", "抽出"]],
      ["remove-duplicate-rows", ["整形"]],
      ["compare-data-differences", ["結合", "チェック", "抽出"]],
      ["replace-values-from-map", ["結合", "変換"]],
      ["append-same-format-files", ["結合"]],
      ["add-date-parts", ["変換", "整形"]],
      ["normalize-text", ["整形"]],
      ["find-invalid-values", ["チェック", "抽出"]],
      ["calculate-elapsed-days", ["変換"]],
      ["find-missing-master-keys", ["結合", "チェック", "抽出"]],
    ],
  );
});

test("表変換・時系列確認・入力状況集計などの公式処理をさらに10件追加する", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(15).map((sample) => [sample.id, sample.categories]),
    [
      ["wide-to-long", ["整形", "変換"]],
      ["long-to-wide", ["集計", "変換"]],
      ["previous-value-difference", ["変換", "チェック"]],
      ["find-overlapping-periods", ["チェック", "抽出"]],
      ["summarize-input-status", ["集計", "チェック"]],
      ["summarize-duplicate-keys", ["集計", "チェック"]],
      ["find-sequence-gaps", ["チェック", "抽出"]],
      ["split-delimited-values", ["整形", "変換"]],
      ["find-numeric-outliers", ["チェック", "抽出"]],
      ["add-subtotals-grand-total", ["集計"]],
    ],
  );
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

test("汎用公式処理のサンプルCSVと入力列定義が一致する", async () => {
  const files = new Map(visibleSampleTemplates.flatMap((sample) => sample.files.map((file) => [file.url, file])));
  for (const file of files.values()) {
    const bytes = await readFile(`public${file.url}`);
    const text = file.encoding === "cp932" || file.encoding === "shift_jis" ? iconv.decode(bytes, file.encoding) : bytes.toString("utf8").replace(/^\uFEFF/, "");
    assert.deepEqual(text.split(/\r?\n/, 1)[0].split(","), file.columns.map((column) => column.name));
  }
});
