import type { EffectiveEncoding, FlowOutput, InputColumn } from "./flow-types";
import type { FlowCategory } from "./flow-categories";

export interface SampleCsvFile {
  label: string;
  name: string;
  url: string;
  encoding: EffectiveEncoding;
  encodingLabel: string;
  columns: InputColumn[];
}

export interface SampleTemplate {
  id: string;
  categories: FlowCategory[];
  title: string;
  inputSummary: string;
  processingSummary: string;
  flowName: string;
  description: string;
  instruction: string;
  sql: string;
  output: FlowOutput;
  files: SampleCsvFile[];
  hidden?: boolean;
}

const reconciliationReferenceFile: SampleCsvFile = {
  label: "基準データ",
  name: "サンプル基準データ.csv",
  url: "/samples/reconciliation-reference-cp932.csv",
  encoding: "cp932",
  encodingLabel: "CP932",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "基準名称", type: "VARCHAR", required: false },
    { name: "基準金額", type: "DOUBLE", required: true },
  ],
};
const reconciliationActualFile: SampleCsvFile = {
  label: "実績データ",
  name: "サンプル実績データ.csv",
  url: "/samples/reconciliation-actual-utf8-bom.csv",
  encoding: "utf-8-bom",
  encodingLabel: "UTF-8 BOM",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "実績日", type: "DATE", required: false },
    { name: "実績金額", type: "DOUBLE", required: true },
  ],
};
const aggregationFile: SampleCsvFile = {
  label: "集計データ",
  name: "サンプル集計データ.csv",
  url: "/samples/aggregation-shift-jis.csv",
  encoding: "shift_jis",
  encodingLabel: "Shift-JIS",
  columns: [
    { name: "処理日", type: "DATE", required: false },
    { name: "集計キー", type: "VARCHAR", required: true },
    { name: "項目名", type: "VARCHAR", required: true },
    { name: "数量", type: "BIGINT", required: true },
    { name: "金額", type: "DOUBLE", required: true },
  ],
};
const detailFile: SampleCsvFile = {
  label: "明細データ",
  name: "サンプル明細データ.csv",
  url: "/samples/generic-details-shift-jis.csv",
  encoding: "shift_jis",
  encodingLabel: "Shift-JIS",
  columns: [
    { name: "処理日", type: "DATE", required: false },
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "項目名", type: "VARCHAR", required: false },
    { name: "数量", type: "BIGINT", required: false },
    { name: "金額", type: "DOUBLE", required: false },
  ],
};
const masterFile: SampleCsvFile = {
  label: "マスタデータ",
  name: "サンプルマスタデータ.csv",
  url: "/samples/generic-master-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "名称", type: "VARCHAR", required: false },
    { name: "分類", type: "VARCHAR", required: false },
  ],
};
const thresholdFile: SampleCsvFile = {
  label: "判定データ",
  name: "サンプル基準値判定データ.csv",
  url: "/samples/threshold-check-utf8-bom.csv",
  encoding: "utf-8-bom",
  encodingLabel: "UTF-8 BOM",
  columns: [
    { name: "項目コード", type: "VARCHAR", required: true },
    { name: "項目名", type: "VARCHAR", required: true },
    { name: "現在値", type: "DOUBLE", required: true },
    { name: "予定値", type: "DOUBLE", required: true },
    { name: "基準値", type: "DOUBLE", required: true },
  ],
};
const qualityCheckFile: SampleCsvFile = {
  label: "確認データ",
  name: "サンプルデータ品質確認.csv",
  url: "/samples/data-quality-check-utf8-bom.csv",
  encoding: "utf-8-bom",
  encodingLabel: "UTF-8 BOM",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "名称", type: "VARCHAR", required: true },
    { name: "必須項目1", type: "VARCHAR", required: true },
    { name: "必須項目2", type: "VARCHAR", required: true },
  ],
};
const latestRecordFile: SampleCsvFile = {
  label: "履歴データ",
  name: "サンプル履歴データ.csv",
  url: "/samples/latest-records-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "更新日", type: "DATE", required: true },
    { name: "名称", type: "VARCHAR", required: false },
    { name: "状態", type: "VARCHAR", required: false },
  ],
};
const duplicateRowsFile: SampleCsvFile = {
  label: "重複を含むデータ",
  name: "サンプル重複データ.csv",
  url: "/samples/duplicate-rows-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "コード", type: "VARCHAR", required: false },
    { name: "名称", type: "VARCHAR", required: false },
    { name: "数量", type: "BIGINT", required: false },
  ],
};
const diffBeforeFile: SampleCsvFile = {
  label: "変更前データ",
  name: "サンプル変更前データ.csv",
  url: "/samples/diff-before-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "比較値", type: "VARCHAR", required: true },
  ],
};
const diffAfterFile: SampleCsvFile = {
  label: "変更後データ",
  name: "サンプル変更後データ.csv",
  url: "/samples/diff-after-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "比較値", type: "VARCHAR", required: true },
  ],
};
const replacementDataFile: SampleCsvFile = {
  label: "変換対象データ",
  name: "サンプル変換対象データ.csv",
  url: "/samples/replacement-data-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: false },
    { name: "変換対象値", type: "VARCHAR", required: true },
  ],
};
const replacementMapFile: SampleCsvFile = {
  label: "対応表",
  name: "サンプル対応表.csv",
  url: "/samples/replacement-map-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "変換前", type: "VARCHAR", required: true },
    { name: "変換後", type: "VARCHAR", required: true },
  ],
};
const appendPart1File: SampleCsvFile = {
  label: "データ1",
  name: "サンプル結合データ1.csv",
  url: "/samples/append-part-1-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "処理日", type: "DATE", required: false },
    { name: "コード", type: "VARCHAR", required: false },
    { name: "金額", type: "DOUBLE", required: false },
  ],
};
const appendPart2File: SampleCsvFile = {
  label: "データ2",
  name: "サンプル結合データ2.csv",
  url: "/samples/append-part-2-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "処理日", type: "DATE", required: false },
    { name: "コード", type: "VARCHAR", required: false },
    { name: "金額", type: "DOUBLE", required: false },
  ],
};
const datePartsFile: SampleCsvFile = {
  label: "日付データ",
  name: "サンプル日付データ.csv",
  url: "/samples/date-parts-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: false },
    { name: "日付", type: "DATE", required: true },
    { name: "名称", type: "VARCHAR", required: false },
  ],
};
const textNormalizationFile: SampleCsvFile = {
  label: "文字列データ",
  name: "サンプル文字列データ.csv",
  url: "/samples/text-normalization-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: false },
    { name: "文字列", type: "VARCHAR", required: true },
  ],
};
const invalidValuesFile: SampleCsvFile = {
  label: "確認データ",
  name: "サンプル形式確認データ.csv",
  url: "/samples/invalid-values-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "数値項目", type: "VARCHAR", required: true },
    { name: "日付項目", type: "VARCHAR", required: true },
  ],
};
const elapsedDaysFile: SampleCsvFile = {
  label: "期間データ",
  name: "サンプル期間データ.csv",
  url: "/samples/elapsed-days-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "開始日", type: "DATE", required: true },
    { name: "終了日", type: "DATE", required: true },
  ],
};
const masterCheckDetailsFile: SampleCsvFile = {
  label: "確認対象データ",
  name: "サンプルマスタ確認対象.csv",
  url: "/samples/master-check-details-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "照合キー", type: "VARCHAR", required: true },
  ],
};
const wideToLongFile: SampleCsvFile = {
  label: "横持ちデータ",
  name: "サンプル横持ちデータ.csv",
  url: "/samples/wide-to-long-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "1月", type: "DOUBLE", required: false },
    { name: "2月", type: "DOUBLE", required: false },
    { name: "3月", type: "DOUBLE", required: false },
  ],
};
const longToWideFile: SampleCsvFile = {
  label: "縦持ちデータ",
  name: "サンプル縦持ちデータ.csv",
  url: "/samples/long-to-wide-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "区分", type: "VARCHAR", required: true },
    { name: "値", type: "DOUBLE", required: true },
  ],
};
const previousDifferenceFile: SampleCsvFile = {
  label: "履歴データ",
  name: "サンプル増減確認データ.csv",
  url: "/samples/previous-difference-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "日付", type: "DATE", required: true },
    { name: "値", type: "DOUBLE", required: true },
  ],
};
const overlappingPeriodsFile: SampleCsvFile = {
  label: "期間データ",
  name: "サンプル期間重複データ.csv",
  url: "/samples/overlapping-periods-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "対象キー", type: "VARCHAR", required: true },
    { name: "開始日", type: "DATE", required: true },
    { name: "終了日", type: "DATE", required: true },
  ],
};
const inputStatusFile: SampleCsvFile = {
  label: "確認データ",
  name: "サンプル入力状況データ.csv",
  url: "/samples/input-status-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: false },
    { name: "名称", type: "VARCHAR", required: false },
    { name: "メール", type: "VARCHAR", required: false },
    { name: "区分", type: "VARCHAR", required: false },
  ],
};
const duplicateKeysFile: SampleCsvFile = {
  label: "重複確認データ",
  name: "サンプルキー重複データ.csv",
  url: "/samples/duplicate-keys-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "照合キー", type: "VARCHAR", required: true },
    { name: "名称", type: "VARCHAR", required: false },
    { name: "金額", type: "DOUBLE", required: false },
  ],
};
const sequenceGapsFile: SampleCsvFile = {
  label: "連続データ",
  name: "サンプル日付連番データ.csv",
  url: "/samples/sequence-gaps-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "グループキー", type: "VARCHAR", required: true },
    { name: "連番", type: "BIGINT", required: true },
    { name: "日付", type: "DATE", required: true },
  ],
};
const delimitedValuesFile: SampleCsvFile = {
  label: "複数値データ",
  name: "サンプル複数値データ.csv",
  url: "/samples/delimited-values-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "値一覧", type: "VARCHAR", required: true },
  ],
};
const outliersFile: SampleCsvFile = {
  label: "数値データ",
  name: "サンプル外れ値データ.csv",
  url: "/samples/outliers-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "ID", type: "VARCHAR", required: true },
    { name: "値", type: "DOUBLE", required: true },
  ],
};
const subtotalFile: SampleCsvFile = {
  label: "集計データ",
  name: "サンプル小計総計データ.csv",
  url: "/samples/subtotal-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [
    { name: "集計キー", type: "VARCHAR", required: true },
    { name: "金額", type: "DOUBLE", required: true },
  ],
};
const wideResultTestFile: SampleCsvFile = {
  label: "表示確認CSV",
  name: "表示確認用135行30列.csv",
  url: "/samples/wide-result-test-utf8.csv",
  encoding: "utf-8",
  encodingLabel: "UTF-8",
  columns: [{ name: "レコードID", type: "VARCHAR", required: true }],
};

export const sampleTemplates: SampleTemplate[] = [
  {
    id: "invoice-payment",
    categories: ["結合", "チェック"],
    title: "2つのデータをキーと金額で照合",
    inputSummary: "2 CSV",
    processingSummary: "キー照合、金額比較、片側データ判定",
    flowName: "キー・金額照合",
    description: "2つのデータを照合キーで突き合わせ、金額一致・不一致・片方だけにあるデータへ分類します。請求と入金、注文と実績などに使えます。",
    instruction: "基準データと実績データを照合キーで突き合わせて、金額の一致、不一致、基準だけ、実績だけが分かるようにして。",
    sql: `WITH reference_totals AS (
  SELECT CAST("照合キー" AS VARCHAR) AS match_key, SUM(TRY_CAST("基準金額" AS DOUBLE)) AS reference_amount
  FROM input_1 GROUP BY 1
), actual_totals AS (
  SELECT CAST("照合キー" AS VARCHAR) AS match_key, SUM(TRY_CAST("実績金額" AS DOUBLE)) AS actual_amount
  FROM input_2 GROUP BY 1
)
SELECT
  COALESCE(r.match_key, a.match_key) AS "照合キー",
  r.reference_amount AS "基準金額",
  a.actual_amount AS "実績金額",
  CASE
    WHEN r.match_key IS NULL THEN '実績データのみ'
    WHEN a.match_key IS NULL THEN '基準データのみ'
    WHEN r.reference_amount = a.actual_amount THEN '一致'
    ELSE '金額不一致'
  END AS "判定"
FROM reference_totals r
FULL OUTER JOIN actual_totals a USING (match_key)
ORDER BY "判定", "照合キー"`,
    output: { fileName: "キー金額照合結果.csv", encoding: "utf-8", enabled: false },
    files: [reconciliationReferenceFile, reconciliationActualFile],
  },
  {
    id: "sales-by-product",
    categories: ["集計"],
    title: "項目別に数量・金額を集計",
    inputSummary: "1 CSV",
    processingSummary: "グループ集計、合計、並び替え",
    flowName: "項目別の数量・金額集計",
    description: "集計キーごとに数量と金額を合計し、金額の多い順に並べます。商品、店舗、担当者などの集計に使えます。",
    instruction: "データを集計キーと項目名ごとにまとめて、数量と金額を合計し、金額が多い順に並べて。",
    sql: `SELECT
  "集計キー",
  "項目名",
  SUM(TRY_CAST("数量" AS BIGINT)) AS "数量合計",
  SUM(TRY_CAST("金額" AS DOUBLE)) AS "金額合計"
FROM input_1
GROUP BY "集計キー", "項目名"
ORDER BY "金額合計" DESC, "集計キー"`,
    output: { fileName: "項目別集計.csv", encoding: "utf-8", enabled: false },
    files: [aggregationFile],
  },
  {
    id: "attach-product-master",
    categories: ["結合"],
    title: "キーでマスタ情報を付与",
    inputSummary: "2 CSV",
    processingSummary: "キー結合、マスタ列の追加",
    flowName: "キーでマスタ情報を付与",
    description: "明細データへ、照合キーが一致するマスタの列を追加します。商品、顧客、社員、店舗などのマスタ付与に使えます。",
    instruction: "明細データに、照合キーが同じマスタデータを結び付けて、マスタ側の情報を追加して。",
    sql: `SELECT
  d.*,
  m.* EXCLUDE ("照合キー")
FROM input_1 d
LEFT JOIN input_2 m ON d."照合キー" = m."照合キー"
ORDER BY d."照合キー"`,
    output: { fileName: "マスタ情報付与結果.csv", encoding: "utf-8", enabled: false },
    files: [detailFile, masterFile],
  },
  {
    id: "low-inventory",
    categories: ["抽出", "チェック"],
    title: "基準値を下回るデータを抽出",
    inputSummary: "1 CSV",
    processingSummary: "基準比較、不足値計算、並び替え",
    flowName: "基準値未達データの抽出",
    description: "現在値と予定値の合計が基準値を下回る項目を抽出します。在庫、予算、目標、要員数などの確認に使えます。",
    instruction: "現在値と予定値を足しても基準値に届かない項目だけを出して、不足値が大きい順に並べて。",
    sql: `SELECT
  "項目コード",
  "項目名",
  TRY_CAST("現在値" AS DOUBLE) AS "現在値",
  TRY_CAST("予定値" AS DOUBLE) AS "予定値",
  TRY_CAST("基準値" AS DOUBLE) AS "基準値",
  TRY_CAST("基準値" AS DOUBLE) - TRY_CAST("現在値" AS DOUBLE) - TRY_CAST("予定値" AS DOUBLE) AS "不足値"
FROM input_1
WHERE TRY_CAST("現在値" AS DOUBLE) + TRY_CAST("予定値" AS DOUBLE) < TRY_CAST("基準値" AS DOUBLE)
ORDER BY "不足値" DESC, "項目コード"`,
    output: { fileName: "基準値未達一覧.csv", encoding: "utf-8", enabled: false },
    files: [thresholdFile],
  },
  {
    id: "customer-data-check",
    categories: ["チェック"],
    title: "ID重複・必須項目の空欄を確認",
    inputSummary: "1 CSV",
    processingSummary: "重複検出、空欄・NULL判定",
    flowName: "ID重複・必須項目チェック",
    description: "IDの重複と名称・必須項目の空欄を検出し、理由を表示します。顧客、商品、会員、申込データなどの確認に使えます。",
    instruction: "IDが重複しているか、名称、必須項目1、必須項目2のどれかが空欄の行を見つけて、理由も表示して。",
    sql: `WITH checked AS (
  SELECT *, COUNT(*) OVER (PARTITION BY "ID") AS id_count
  FROM input_1
)
SELECT
  "ID",
  "名称",
  "必須項目1",
  "必須項目2",
  CONCAT_WS('、',
    CASE WHEN id_count > 1 THEN 'ID重複' END,
    CASE WHEN NULLIF(TRIM(COALESCE("名称", '')), '') IS NULL THEN '名称未入力' END,
    CASE WHEN NULLIF(TRIM(COALESCE("必須項目1", '')), '') IS NULL THEN '必須項目1未入力' END,
    CASE WHEN NULLIF(TRIM(COALESCE("必須項目2", '')), '') IS NULL THEN '必須項目2未入力' END
  ) AS "確認結果"
FROM checked
WHERE id_count > 1
   OR NULLIF(TRIM(COALESCE("名称", '')), '') IS NULL
   OR NULLIF(TRIM(COALESCE("必須項目1", '')), '') IS NULL
   OR NULLIF(TRIM(COALESCE("必須項目2", '')), '') IS NULL
ORDER BY "ID"`,
    output: { fileName: "データ品質確認結果.csv", encoding: "utf-8", enabled: false },
    files: [qualityCheckFile],
  },
  {
    id: "latest-record-by-key",
    categories: ["整形", "抽出"],
    title: "キーごとに最新の1件を残す",
    inputSummary: "1 CSV",
    processingSummary: "キー別の最新日判定、重複履歴の整理",
    flowName: "キーごとに最新の1件を残す",
    description: "同じIDの履歴から更新日が最も新しい行だけを残します。顧客、商品、契約、案件などの最新状態を作るときに使えます。",
    instruction: "IDごとに更新日が最も新しい1件だけを残して、ID順に並べて。",
    sql: `WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY "ID"
    ORDER BY TRY_CAST("更新日" AS DATE) DESC NULLS LAST
  ) AS __row_number
  FROM input_1
)
SELECT * EXCLUDE (__row_number)
FROM ranked
WHERE __row_number = 1
ORDER BY "ID"`,
    output: { fileName: "キー別最新データ.csv", encoding: "utf-8", enabled: false },
    files: [latestRecordFile],
  },
  {
    id: "remove-duplicate-rows",
    categories: ["整形"],
    title: "完全に同じ重複行を削除",
    inputSummary: "1 CSV",
    processingSummary: "全列一致の重複を除外",
    flowName: "重複行を削除",
    description: "全ての列が同じ行を1件にまとめます。列名や列数を問わず、そのまま使えます。",
    instruction: "全ての列が完全に同じ重複行を削除して。",
    sql: `SELECT DISTINCT * FROM input_1`,
    output: { fileName: "重複削除結果.csv", encoding: "utf-8", enabled: false },
    files: [duplicateRowsFile],
  },
  {
    id: "compare-data-differences",
    categories: ["結合", "チェック", "抽出"],
    title: "2つのデータの追加・削除・変更を確認",
    inputSummary: "2 CSV",
    processingSummary: "キー照合、差分種別判定、差分のみ抽出",
    flowName: "2つのデータの差分を抽出",
    description: "変更前と変更後を照合キーで比較し、追加・削除・変更された行だけを抽出します。",
    instruction: "変更前と変更後を照合キーで比較して、追加、削除、比較値の変更があった行だけを出して。",
    sql: `SELECT
  COALESCE(b."照合キー", a."照合キー") AS "照合キー",
  b."比較値" AS "変更前",
  a."比較値" AS "変更後",
  CASE
    WHEN b."照合キー" IS NULL THEN '追加'
    WHEN a."照合キー" IS NULL THEN '削除'
    ELSE '変更'
  END AS "差分種別"
FROM input_1 b
FULL OUTER JOIN input_2 a ON b."照合キー" = a."照合キー"
WHERE b."照合キー" IS NULL
   OR a."照合キー" IS NULL
   OR b."比較値" IS DISTINCT FROM a."比較値"
ORDER BY "差分種別", "照合キー"`,
    output: { fileName: "データ差分.csv", encoding: "utf-8", enabled: false },
    files: [diffBeforeFile, diffAfterFile],
  },
  {
    id: "replace-values-from-map",
    categories: ["結合", "変換"],
    title: "対応表を使って値を一括置換",
    inputSummary: "2 CSV",
    processingSummary: "対応表結合、該当値の置換",
    flowName: "対応表を使って値を置換",
    description: "変換対象の値を対応表と照合し、一致した値を置き換えます。コード変換や表記統一に使えます。",
    instruction: "変換対象値を対応表の変換前と照合して、一致したら変換後の値に置き換えて。対応がない値は元のまま残して。",
    sql: `SELECT
  d.* EXCLUDE ("変換対象値"),
  COALESCE(m."変換後", d."変換対象値") AS "変換対象値"
FROM input_1 d
LEFT JOIN input_2 m ON d."変換対象値" = m."変換前"
`,
    output: { fileName: "値置換結果.csv", encoding: "utf-8", enabled: false },
    files: [replacementDataFile, replacementMapFile],
  },
  {
    id: "append-same-format-files",
    categories: ["結合"],
    title: "同じ列構成の2ファイルを縦に結合",
    inputSummary: "2 CSV",
    processingSummary: "行の追加、入力元の付与",
    flowName: "同じ形式の2ファイルを縦に結合",
    description: "同じ列構成の2ファイルを1つにまとめ、各行の入力元も追加します。月別・拠点別ファイルの統合に使えます。",
    instruction: "同じ形式の2つのデータを縦に結合して、どちらのデータから来たか入力元も追加して。",
    sql: `SELECT *, 'データ1' AS "入力元" FROM input_1
UNION ALL BY NAME
SELECT *, 'データ2' AS "入力元" FROM input_2`,
    output: { fileName: "縦結合結果.csv", encoding: "utf-8", enabled: false },
    files: [appendPart1File, appendPart2File],
  },
  {
    id: "add-date-parts",
    categories: ["変換", "整形"],
    title: "日付から年月・年度・曜日を追加",
    inputSummary: "1 CSV",
    processingSummary: "日付分解、年度・曜日の計算",
    flowName: "日付から年月・年度・曜日を追加",
    description: "日付から年、月、年月、4月始まりの年度、曜日を追加します。集計前のデータ準備に使えます。",
    instruction: "日付から年、月、年月、4月始まりの年度、日本語の曜日を追加して。",
    sql: `WITH parsed AS (
  SELECT *, TRY_CAST("日付" AS DATE) AS __date_value FROM input_1
)
SELECT
  * EXCLUDE (__date_value),
  EXTRACT(YEAR FROM __date_value)::BIGINT AS "年",
  EXTRACT(MONTH FROM __date_value)::BIGINT AS "月",
  STRFTIME(__date_value, '%Y-%m') AS "年月",
  (EXTRACT(YEAR FROM __date_value) - CASE WHEN EXTRACT(MONTH FROM __date_value) < 4 THEN 1 ELSE 0 END)::BIGINT AS "年度",
  CASE EXTRACT(DOW FROM __date_value)
    WHEN 0 THEN '日' WHEN 1 THEN '月' WHEN 2 THEN '火' WHEN 3 THEN '水'
    WHEN 4 THEN '木' WHEN 5 THEN '金' WHEN 6 THEN '土'
  END AS "曜日"
FROM parsed
ORDER BY __date_value`,
    output: { fileName: "日付項目追加結果.csv", encoding: "utf-8", enabled: false },
    files: [datePartsFile],
  },
  {
    id: "normalize-text",
    categories: ["整形"],
    title: "文字列の余分な空白と英字表記を統一",
    inputSummary: "1 CSV",
    processingSummary: "前後空白除去、連続空白圧縮、英字小文字化",
    flowName: "文字列の空白・英字表記を整える",
    description: "文字列の前後の空白を削除し、連続する空白を1つにして、英字を小文字へ統一します。",
    instruction: "文字列の前後の空白を取り、連続する空白を1つにして、英字を小文字にそろえて。元の値も残して。",
    sql: `SELECT
  *,
  LOWER(REGEXP_REPLACE(TRIM("文字列"), '\\s+', ' ', 'g')) AS "整形後文字列"
FROM input_1
`,
    output: { fileName: "文字列整形結果.csv", encoding: "utf-8", enabled: false },
    files: [textNormalizationFile],
  },
  {
    id: "find-invalid-values",
    categories: ["チェック", "抽出"],
    title: "数値・日付として扱えない行を抽出",
    inputSummary: "1 CSV",
    processingSummary: "空欄判定、数値・日付形式検査",
    flowName: "数値・日付として不正な行を抽出",
    description: "指定列が空欄、または数値・日付へ変換できない行を抽出し、理由を表示します。",
    instruction: "数値項目と日付項目が空欄、または正しい形式でない行だけを出して、理由も表示して。",
    sql: `SELECT
  *,
  CONCAT_WS('、',
    CASE WHEN NULLIF(TRIM(COALESCE("数値項目", '')), '') IS NULL THEN '数値項目が空欄'
         WHEN TRY_CAST("数値項目" AS DOUBLE) IS NULL THEN '数値形式が不正' END,
    CASE WHEN NULLIF(TRIM(COALESCE("日付項目", '')), '') IS NULL THEN '日付項目が空欄'
         WHEN TRY_CAST("日付項目" AS DATE) IS NULL THEN '日付形式が不正' END
  ) AS "確認結果"
FROM input_1
WHERE NULLIF(TRIM(COALESCE("数値項目", '')), '') IS NULL
   OR TRY_CAST("数値項目" AS DOUBLE) IS NULL
   OR NULLIF(TRIM(COALESCE("日付項目", '')), '') IS NULL
   OR TRY_CAST("日付項目" AS DATE) IS NULL
ORDER BY "ID"`,
    output: { fileName: "不正値確認結果.csv", encoding: "utf-8", enabled: false },
    files: [invalidValuesFile],
  },
  {
    id: "calculate-elapsed-days",
    categories: ["変換"],
    title: "開始日と終了日から経過日数を計算",
    inputSummary: "1 CSV",
    processingSummary: "日付差の計算、前後関係の判定",
    flowName: "開始日と終了日から経過日数を計算",
    description: "開始日から終了日までの経過日数を計算し、終了日が開始日より前のデータも判別します。",
    instruction: "開始日から終了日までの経過日数を計算して、終了日が開始日より前なら確認が必要と表示して。",
    sql: `SELECT
  *,
  DATE_DIFF('day', TRY_CAST("開始日" AS DATE), TRY_CAST("終了日" AS DATE)) AS "経過日数",
  CASE
    WHEN TRY_CAST("終了日" AS DATE) < TRY_CAST("開始日" AS DATE) THEN '日付要確認'
    ELSE '正常'
  END AS "判定"
FROM input_1
ORDER BY "ID"`,
    output: { fileName: "経過日数計算結果.csv", encoding: "utf-8", enabled: false },
    files: [elapsedDaysFile],
  },
  {
    id: "find-missing-master-keys",
    categories: ["結合", "チェック", "抽出"],
    title: "マスタに登録されていないキーを抽出",
    inputSummary: "2 CSV",
    processingSummary: "マスタ照合、未登録データ抽出",
    flowName: "マスタに存在しないデータを抽出",
    description: "確認対象データをマスタと照合し、マスタに存在しないキーを持つ行だけを抽出します。",
    instruction: "確認対象データを照合キーでマスタと照合して、マスタに存在しない行だけを出して。",
    sql: `SELECT d.*
FROM input_1 d
LEFT JOIN input_2 m ON d."照合キー" = m."照合キー"
WHERE m."照合キー" IS NULL
ORDER BY d."照合キー", d."ID"`,
    output: { fileName: "マスタ未登録データ.csv", encoding: "utf-8", enabled: false },
    files: [masterCheckDetailsFile, masterFile],
  },
  {
    id: "wide-to-long",
    categories: ["整形", "変換"],
    title: "横に並んだ項目を縦の行へ変換",
    inputSummary: "1 CSV",
    processingSummary: "可変列の縦持ち変換、項目名と値へ展開",
    flowName: "横持ちデータを縦持ちに変換",
    description: "ID以外の列を、項目名と値の2列へ縦に展開します。月別・拠点別など横に広い表を集計しやすい形へ変換できます。",
    instruction: "ID以外の列を項目名と値に分けて縦に並べ、ID、項目名の順に並べて。",
    sql: `WITH unpivoted AS (
  UNPIVOT input_1
  ON COLUMNS(* EXCLUDE ("ID"))
  INTO NAME "項目名" VALUE "値"
)
SELECT * FROM unpivoted
ORDER BY "ID", "項目名"`,
    output: { fileName: "縦持ち変換結果.csv", encoding: "utf-8", enabled: false },
    files: [wideToLongFile],
  },
  {
    id: "long-to-wide",
    categories: ["集計", "変換"],
    title: "縦に並んだ区分を横の列へ集計",
    inputSummary: "1 CSV",
    processingSummary: "区分別の列生成、値の合計",
    flowName: "縦持ちデータを横持ちに集計",
    description: "区分の値から列を自動生成し、IDごとの値を横並びに集計します。月別・分類別のクロス集計表を作れます。",
    instruction: "区分ごとに列を作り、IDごとの値を合計して横持ちの表にして。",
    sql: `WITH pivoted AS (
  PIVOT input_1
  ON "区分"
  USING SUM(TRY_CAST("値" AS DOUBLE))
  GROUP BY "ID"
)
SELECT * FROM pivoted
ORDER BY "ID"`,
    output: { fileName: "横持ち集計結果.csv", encoding: "utf-8", enabled: false },
    files: [longToWideFile],
  },
  {
    id: "previous-value-difference",
    categories: ["変換", "チェック"],
    title: "キーごとに前回値との差を計算",
    inputSummary: "1 CSV",
    processingSummary: "前回値取得、増減値・増減率計算",
    flowName: "キーごとに前回からの増減を計算",
    description: "IDごとに日付順の前回値を取得し、増減値と増減率を追加します。売上、残高、在庫などの推移確認に使えます。",
    instruction: "IDごとに日付順で前回値を取得して、現在値との差と増減率を追加して。",
    sql: `WITH history AS (
  SELECT
    *,
    TRY_CAST("値" AS DOUBLE) AS __current_value,
    LAG(TRY_CAST("値" AS DOUBLE)) OVER (
      PARTITION BY "ID" ORDER BY TRY_CAST("日付" AS DATE)
    ) AS __previous_value
  FROM input_1
)
SELECT
  * EXCLUDE (__current_value, __previous_value),
  __previous_value AS "前回値",
  __current_value - __previous_value AS "増減値",
  ROUND(100.0 * (__current_value - __previous_value) / NULLIF(ABS(__previous_value), 0), 1) AS "増減率（%）"
FROM history
ORDER BY "ID", TRY_CAST("日付" AS DATE)`,
    output: { fileName: "前回比計算結果.csv", encoding: "utf-8", enabled: false },
    files: [previousDifferenceFile],
  },
  {
    id: "find-overlapping-periods",
    categories: ["チェック", "抽出"],
    title: "同じキーで重複する期間を抽出",
    inputSummary: "1 CSV",
    processingSummary: "期間の重なり判定、重複ペア抽出",
    flowName: "開始日と終了日の期間重複を検出",
    description: "同じ対象キーの開始日・終了日を比較し、期間が重なっている組み合わせを抽出します。契約、予約、勤務期間などの確認に使えます。",
    instruction: "同じ対象キーの期間を比較して、開始日から終了日までが重なっているIDの組み合わせを出して。",
    sql: `SELECT
  a."対象キー",
  a."ID" AS "ID1",
  a."開始日" AS "開始日1",
  a."終了日" AS "終了日1",
  b."ID" AS "ID2",
  b."開始日" AS "開始日2",
  b."終了日" AS "終了日2"
FROM input_1 a
JOIN input_1 b
  ON a."対象キー" = b."対象キー"
 AND CAST(a."ID" AS VARCHAR) < CAST(b."ID" AS VARCHAR)
 AND TRY_CAST(a."開始日" AS DATE) <= TRY_CAST(b."終了日" AS DATE)
 AND TRY_CAST(b."開始日" AS DATE) <= TRY_CAST(a."終了日" AS DATE)
ORDER BY a."対象キー", a."ID", b."ID"`,
    output: { fileName: "期間重複一覧.csv", encoding: "utf-8", enabled: false },
    files: [overlappingPeriodsFile],
  },
  {
    id: "summarize-input-status",
    categories: ["集計", "チェック"],
    title: "各項目の入力件数・空欄数・入力率を確認",
    inputSummary: "1 CSV",
    processingSummary: "全列の縦展開、空欄・入力率・値種類数集計",
    flowName: "項目ごとの入力状況を集計",
    description: "全ての項目について、全件数、入力あり、空欄、入力率、異なる値の数を一覧にします。列構成を問わず使えます。",
    instruction: "各項目について、全件数、入力ありの件数、空欄数、入力率、異なる値の数を集計して。",
    sql: `WITH text_source AS (
  SELECT COALESCE(COLUMNS(*)::VARCHAR, '') FROM input_1
), unpivoted AS (
  UNPIVOT text_source
  ON COLUMNS(*)
  INTO NAME "項目名" VALUE "値"
)
SELECT
  "項目名",
  COUNT(*) AS "全件数",
  COUNT(*) FILTER (WHERE NULLIF(TRIM("値"), '') IS NOT NULL) AS "入力あり",
  COUNT(*) FILTER (WHERE NULLIF(TRIM("値"), '') IS NULL) AS "空欄",
  ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(TRIM("値"), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS "入力率（%）",
  COUNT(DISTINCT NULLIF(TRIM("値"), '')) AS "異なる値の数"
FROM unpivoted
GROUP BY "項目名"
ORDER BY "項目名"`,
    output: { fileName: "項目別入力状況.csv", encoding: "utf-8", enabled: false },
    files: [inputStatusFile],
  },
  {
    id: "summarize-duplicate-keys",
    categories: ["集計", "チェック"],
    title: "重複キーの件数と該当行を確認",
    inputSummary: "1 CSV",
    processingSummary: "キー別件数集計、重複行抽出",
    flowName: "キーの重複件数を集計",
    description: "照合キーが2件以上あるデータだけを抽出し、各行へ重複件数を追加します。列構成を保ったまま確認できます。",
    instruction: "照合キーごとの件数を数えて、2件以上あるキーの行だけに重複件数を付けて出して。",
    sql: `WITH duplicate_keys AS (
  SELECT "照合キー", COUNT(*) AS "重複件数"
  FROM input_1
  GROUP BY "照合キー"
  HAVING COUNT(*) > 1
)
SELECT d.*, k."重複件数"
FROM input_1 d
JOIN duplicate_keys k USING ("照合キー")
ORDER BY k."重複件数" DESC, d."照合キー"`,
    output: { fileName: "キー重複一覧.csv", encoding: "utf-8", enabled: false },
    files: [duplicateKeysFile],
  },
  {
    id: "find-sequence-gaps",
    categories: ["チェック", "抽出"],
    title: "グループ内の日付・連番の抜けを確認",
    inputSummary: "1 CSV",
    processingSummary: "前行比較、欠番・日付空白期間検出",
    flowName: "日付・連番の抜けを検出",
    description: "グループごとに日付順で前の行と比較し、連番の欠番または日付の空白期間がある箇所を抽出します。",
    instruction: "グループキーごとに日付順で並べて、連番が飛んでいる箇所か、前回日付から2日以上空いている箇所を出して。",
    sql: `WITH ordered AS (
  SELECT
    *,
    LAG(TRY_CAST("連番" AS BIGINT)) OVER (
      PARTITION BY "グループキー" ORDER BY TRY_CAST("日付" AS DATE), TRY_CAST("連番" AS BIGINT)
    ) AS __previous_number,
    LAG(TRY_CAST("日付" AS DATE)) OVER (
      PARTITION BY "グループキー" ORDER BY TRY_CAST("日付" AS DATE), TRY_CAST("連番" AS BIGINT)
    ) AS __previous_date
  FROM input_1
)
SELECT
  "グループキー",
  __previous_number AS "前回連番",
  TRY_CAST("連番" AS BIGINT) AS "今回連番",
  CASE WHEN TRY_CAST("連番" AS BIGINT) - __previous_number > 1
    THEN CONCAT(__previous_number + 1, '～', TRY_CAST("連番" AS BIGINT) - 1) END AS "不足連番",
  __previous_date AS "前回日付",
  TRY_CAST("日付" AS DATE) AS "今回日付",
  GREATEST(DATE_DIFF('day', __previous_date, TRY_CAST("日付" AS DATE)) - 1, 0) AS "空白日数"
FROM ordered
WHERE TRY_CAST("連番" AS BIGINT) - __previous_number > 1
   OR DATE_DIFF('day', __previous_date, TRY_CAST("日付" AS DATE)) > 1
ORDER BY "グループキー", "今回日付", "今回連番"`,
    output: { fileName: "日付連番抜け一覧.csv", encoding: "utf-8", enabled: false },
    files: [sequenceGapsFile],
  },
  {
    id: "split-delimited-values",
    categories: ["整形", "変換"],
    title: "1セル内の複数値を別々の行へ展開",
    inputSummary: "1 CSV",
    processingSummary: "区切り文字統一、値の行展開",
    flowName: "区切り文字で入った値を行に展開",
    description: "カンマ、読点、セミコロンで区切られた値を1つずつ別の行へ展開します。タグや分類などの複数値を扱いやすくできます。",
    instruction: "値一覧をカンマ、読点、セミコロンで分けて、空の値を除き、1つの値につき1行にして。",
    sql: `WITH expanded AS (
  SELECT
    * EXCLUDE ("値一覧"),
    "値一覧" AS "元の値一覧",
    TRIM(UNNEST(STRING_SPLIT(
      REPLACE(REPLACE(REPLACE(COALESCE("値一覧", ''), '、', ','), '；', ','), ';', ','),
      ','
    ))) AS "値"
  FROM input_1
)
SELECT * FROM expanded
WHERE "値" <> ''
ORDER BY "ID", "値"`,
    output: { fileName: "複数値展開結果.csv", encoding: "utf-8", enabled: false },
    files: [delimitedValuesFile],
  },
  {
    id: "find-numeric-outliers",
    categories: ["チェック", "抽出"],
    title: "極端に大きい・小さい数値を抽出",
    inputSummary: "1 CSV",
    processingSummary: "四分位範囲計算、外れ値判定",
    flowName: "数値の外れ値を抽出",
    description: "値の分布から四分位範囲を計算し、一般的な1.5×IQR基準で極端に大きい・小さい行を抽出します。",
    instruction: "値の第1四分位数と第3四分位数を求めて、1.5倍の四分位範囲より外側にある行を外れ値として出して。",
    sql: `WITH parsed AS (
  SELECT *, TRY_CAST("値" AS DOUBLE) AS __value
  FROM input_1
), stats AS (
  SELECT
    QUANTILE_CONT(__value, 0.25) AS __q1,
    QUANTILE_CONT(__value, 0.75) AS __q3
  FROM parsed
  WHERE __value IS NOT NULL
)
SELECT
  p.* EXCLUDE (__value),
  s.__q1 AS "第1四分位数",
  s.__q3 AS "第3四分位数",
  CASE WHEN p.__value < s.__q1 - 1.5 * (s.__q3 - s.__q1) THEN '小さい外れ値' ELSE '大きい外れ値' END AS "判定"
FROM parsed p
CROSS JOIN stats s
WHERE p.__value < s.__q1 - 1.5 * (s.__q3 - s.__q1)
   OR p.__value > s.__q3 + 1.5 * (s.__q3 - s.__q1)
ORDER BY p.__value`,
    output: { fileName: "数値外れ値一覧.csv", encoding: "utf-8", enabled: false },
    files: [outliersFile],
  },
  {
    id: "add-subtotals-grand-total",
    categories: ["集計"],
    title: "項目別の小計と全体の総計を作成",
    inputSummary: "1 CSV",
    processingSummary: "グループ小計、全体総計",
    flowName: "小計・総計を追加",
    description: "集計キーごとの金額小計と、全データの総計を同じ一覧にします。部門、商品、店舗などの集計に使えます。",
    instruction: "集計キーごとに金額を小計して、最後に全データの総計も追加して。",
    sql: `WITH totals AS (
  SELECT
    CASE WHEN GROUPING("集計キー") = 1 THEN '総計' ELSE CAST("集計キー" AS VARCHAR) END AS "集計キー",
    SUM(TRY_CAST("金額" AS DOUBLE)) AS "金額合計",
    GROUPING("集計キー") AS __total_row
  FROM input_1
  GROUP BY GROUPING SETS (("集計キー"), ())
)
SELECT * EXCLUDE (__total_row)
FROM totals
ORDER BY __total_row, "集計キー"`,
    output: { fileName: "小計総計.csv", encoding: "utf-8", enabled: false },
    files: [subtotalFile],
  },
  {
    id: "wide-result-display-test",
    categories: ["チェック"],
    title: "多列・多行の表示確認",
    inputSummary: "1 CSV",
    processingSummary: "135行・30列の結果表を表示",
    flowName: "結果表の表示確認",
    description: "多列・多行の結果プレビューを確認するための開発用処理です。",
    instruction: "全ての列と行を、そのままレコードID順に表示して。",
    sql: `SELECT * FROM input_1 ORDER BY "レコードID"`,
    output: { fileName: "表示確認結果.csv", encoding: "utf-8", enabled: false },
    files: [wideResultTestFile],
    hidden: true,
  },
];

export const visibleSampleTemplates = sampleTemplates.filter((sample) => !sample.hidden);

export function getSampleTemplate(id: string) {
  return sampleTemplates.find((sample) => sample.id === id);
}
