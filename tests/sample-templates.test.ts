import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import iconv from "iconv-lite";
import { getSampleTemplate, sampleTemplates, visibleSampleTemplates } from "../lib/sample-templates.ts";
import { getBundledDemo, getBundledSampleFiles, OFFICIAL_FLOW_PREFIX } from "../lib/demo-flow.ts";
import { loadPublicFlow } from "../lib/flow-store.ts";
import { inspectSqlStructure } from "../lib/sql-safety.ts";

test("all sample templates contain safe SQL and the declared number of CSV files", () => {
  assert.equal(sampleTemplates.length, 26);
  assert.equal(visibleSampleTemplates.length, 25);
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
    assert.deepEqual(flow?.categories, sample.categories);
    assert.equal(flow?.inputs.length, sample.files.length);
    assert.equal(Object.keys(files ?? {}).length, sample.files.length);
    assert.deepEqual(flow?.inputs.map((input) => input.requiredColumns), sample.files.map((file) => file.columns));
  }
});

test("公式処理は外部公開APIを待たずに内蔵定義から読み込める", async () => {
  const flow = await loadPublicFlow("official-latest-record-by-key");
  assert.equal(flow.name, "キーごとに最新の1件を残す");
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

test("既存の公式IDを保ったまま5件を汎用的な処理名にする", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(0, 5).map((sample) => [sample.id, sample.flowName]),
    [
      ["invoice-payment", "キー・金額照合"],
      ["sales-by-product", "項目別の数量・金額集計"],
      ["attach-product-master", "キーでマスタ情報を付与"],
      ["low-inventory", "基準値未達データの抽出"],
      ["customer-data-check", "ID重複・必須項目チェック"],
    ],
  );
});

test("汎用的な公式処理を10件追加し、内容に応じて複数カテゴリへ分類する", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(5, 15).map((sample) => [sample.id, sample.flowName, sample.categories]),
    [
      ["latest-record-by-key", "キーごとに最新の1件を残す", ["整形", "抽出"]],
      ["remove-duplicate-rows", "重複行を削除", ["整形"]],
      ["compare-data-differences", "2つのデータの差分を抽出", ["結合", "チェック", "抽出"]],
      ["replace-values-from-map", "対応表を使って値を置換", ["結合", "変換"]],
      ["append-same-format-files", "同じ形式の2ファイルを縦に結合", ["結合"]],
      ["add-date-parts", "日付から年月・年度・曜日を追加", ["変換", "整形"]],
      ["normalize-text", "文字列の空白・英字表記を整える", ["整形"]],
      ["find-invalid-values", "数値・日付として不正な行を抽出", ["チェック", "抽出"]],
      ["calculate-elapsed-days", "開始日と終了日から経過日数を計算", ["変換"]],
      ["find-missing-master-keys", "マスタに存在しないデータを抽出", ["結合", "チェック", "抽出"]],
    ],
  );
});

test("表変換・時系列確認・入力状況集計などの公式処理をさらに10件追加する", () => {
  assert.deepEqual(
    visibleSampleTemplates.slice(15).map((sample) => [sample.id, sample.flowName, sample.categories]),
    [
      ["wide-to-long", "横持ちデータを縦持ちに変換", ["整形", "変換"]],
      ["long-to-wide", "縦持ちデータを横持ちに集計", ["集計", "変換"]],
      ["previous-value-difference", "キーごとに前回からの増減を計算", ["変換", "チェック"]],
      ["find-overlapping-periods", "開始日と終了日の期間重複を検出", ["チェック", "抽出"]],
      ["summarize-input-status", "項目ごとの入力状況を集計", ["集計", "チェック"]],
      ["summarize-duplicate-keys", "キーの重複件数を集計", ["集計", "チェック"]],
      ["find-sequence-gaps", "日付・連番の抜けを検出", ["チェック", "抽出"]],
      ["split-delimited-values", "区切り文字で入った値を行に展開", ["整形", "変換"]],
      ["find-numeric-outliers", "数値の外れ値を抽出", ["チェック", "抽出"]],
      ["add-subtotals-grand-total", "小計・総計を追加", ["集計"]],
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
