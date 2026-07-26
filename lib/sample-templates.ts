import type { EffectiveEncoding, FlowOutput } from "./flow-types";

export interface SampleCsvFile {
  label: string;
  name: string;
  url: string;
  encoding: EffectiveEncoding;
  encodingLabel: string;
}

export interface SampleTemplate {
  id: string;
  title: string;
  inputSummary: string;
  processingSummary: string;
  flowName: string;
  description: string;
  instruction: string;
  sql: string;
  output: FlowOutput;
  files: SampleCsvFile[];
}

const invoiceFile: SampleCsvFile = { label: "請求CSV", name: "サンプル請求.csv", url: "/samples/invoices-cp932.csv", encoding: "cp932", encodingLabel: "CP932" };
const paymentFile: SampleCsvFile = { label: "入金CSV", name: "サンプル入金.csv", url: "/samples/payments-utf8-bom.csv", encoding: "utf-8-bom", encodingLabel: "UTF-8 BOM" };
const salesFile: SampleCsvFile = { label: "売上CSV", name: "サンプル売上.csv", url: "/samples/sales-shift-jis.csv", encoding: "shift_jis", encodingLabel: "Shift-JIS" };
const productFile: SampleCsvFile = { label: "商品マスタ", name: "サンプル商品マスタ.csv", url: "/samples/product-master-utf8.csv", encoding: "utf-8", encodingLabel: "UTF-8" };
const inventoryFile: SampleCsvFile = { label: "在庫CSV", name: "サンプル在庫.csv", url: "/samples/inventory-utf8-bom.csv", encoding: "utf-8-bom", encodingLabel: "UTF-8 BOM" };
const customerFile: SampleCsvFile = { label: "顧客CSV", name: "サンプル顧客.csv", url: "/samples/customers-utf8-bom.csv", encoding: "utf-8-bom", encodingLabel: "UTF-8 BOM" };

export const sampleTemplates: SampleTemplate[] = [
  {
    id: "invoice-payment",
    title: "請求と入金を照合",
    inputSummary: "2 CSV",
    processingSummary: "JOIN、金額比較、未入金判定",
    flowName: "請求・入金チェック",
    description: "請求番号で請求CSVと入金CSVを照合し、一致・金額不一致・未入金・請求なし入金に分類します。",
    instruction: "請求データと入金データを請求番号で突き合わせて、入金済み、金額違い、未入金、請求のない入金が分かるようにして。",
    sql: `WITH invoice_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("請求金額" AS DOUBLE)) AS billed
  FROM input_1 GROUP BY 1
), payment_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("入金額" AS DOUBLE)) AS paid
  FROM input_2 GROUP BY 1
)
SELECT
  COALESCE(i.invoice_no, p.invoice_no) AS "請求番号",
  i.billed AS "請求金額",
  p.paid AS "入金額",
  CASE
    WHEN i.invoice_no IS NULL THEN '請求なし入金'
    WHEN p.invoice_no IS NULL THEN '未入金'
    WHEN i.billed = p.paid THEN '一致'
    ELSE '金額不一致'
  END AS "判定"
FROM invoice_totals i
FULL OUTER JOIN payment_totals p USING (invoice_no)
ORDER BY "判定", "請求番号"`,
    output: { fileName: "請求入金チェック結果.csv", encoding: "utf-8-bom", enabled: true },
    files: [invoiceFile, paymentFile],
  },
  {
    id: "sales-by-product",
    title: "商品別の売上集計",
    inputSummary: "1 CSV",
    processingSummary: "GROUP BY、合計、並び替え",
    flowName: "商品別売上集計",
    description: "売上CSVを商品別に集計し、販売数量と売上金額の多い順に確認します。",
    instruction: "売上データを商品ごとにまとめて、数量と売上金額を合計し、売上金額が多い順に並べて。",
    sql: `SELECT
  "商品コード",
  "商品名",
  SUM(TRY_CAST("数量" AS BIGINT)) AS "販売数量",
  SUM(TRY_CAST("売上金額" AS DOUBLE)) AS "売上合計"
FROM input_1
GROUP BY "商品コード", "商品名"
ORDER BY "売上合計" DESC, "商品コード"`,
    output: { fileName: "商品別売上集計.csv", encoding: "utf-8-bom", enabled: true },
    files: [salesFile],
  },
  {
    id: "attach-product-master",
    title: "商品マスタを付与",
    inputSummary: "2 CSV",
    processingSummary: "マスタ結合、名称・分類の追加",
    flowName: "商品マスタ付与",
    description: "売上CSVへ商品マスタの正式名称と分類を追加します。",
    instruction: "売上データに商品コードが同じ商品マスタを結び付けて、正式な商品名と分類を追加して。",
    sql: `SELECT
  s."売上日",
  s."商品コード",
  m."商品名" AS "正式商品名",
  m."分類",
  s."数量",
  s."売上金額"
FROM input_1 s
LEFT JOIN input_2 m ON s."商品コード" = m."商品コード"
ORDER BY s."売上日", s."商品コード"`,
    output: { fileName: "商品マスタ付与結果.csv", encoding: "utf-8-bom", enabled: true },
    files: [salesFile, productFile],
  },
  {
    id: "low-inventory",
    title: "在庫不足を抽出",
    inputSummary: "1 CSV",
    processingSummary: "条件抽出、計算列、並び替え",
    flowName: "在庫不足チェック",
    description: "現在庫と入荷予定を発注点と比較し、不足する商品を抽出します。",
    instruction: "現在庫と入荷予定を足しても発注点に届かない商品だけを出して、不足数が多い順に並べて。",
    sql: `SELECT
  "商品コード",
  "商品名",
  TRY_CAST("現在庫" AS BIGINT) AS "現在庫",
  TRY_CAST("入荷予定" AS BIGINT) AS "入荷予定",
  TRY_CAST("発注点" AS BIGINT) AS "発注点",
  TRY_CAST("発注点" AS BIGINT) - TRY_CAST("現在庫" AS BIGINT) - TRY_CAST("入荷予定" AS BIGINT) AS "不足数"
FROM input_1
WHERE TRY_CAST("現在庫" AS BIGINT) + TRY_CAST("入荷予定" AS BIGINT) < TRY_CAST("発注点" AS BIGINT)
ORDER BY "不足数" DESC, "商品コード"`,
    output: { fileName: "在庫不足一覧.csv", encoding: "utf-8-bom", enabled: true },
    files: [inventoryFile],
  },
  {
    id: "customer-data-check",
    title: "重複・入力漏れを確認",
    inputSummary: "1 CSV",
    processingSummary: "重複検出、空欄・NULL判定",
    flowName: "顧客データ確認",
    description: "顧客IDの重複と氏名・メールアドレス・電話番号の入力漏れを確認します。",
    instruction: "顧客IDの重複か、氏名、メールアドレス、電話番号のどれかに入力漏れがある行を見つけて、理由も表示して。",
    sql: `WITH checked AS (
  SELECT *, COUNT(*) OVER (PARTITION BY "顧客ID") AS id_count
  FROM input_1
)
SELECT
  "顧客ID",
  "氏名",
  "メールアドレス",
  "電話番号",
  CONCAT_WS('、',
    CASE WHEN id_count > 1 THEN '顧客ID重複' END,
    CASE WHEN NULLIF(TRIM(COALESCE("氏名", '')), '') IS NULL THEN '氏名未入力' END,
    CASE WHEN NULLIF(TRIM(COALESCE("メールアドレス", '')), '') IS NULL THEN 'メールアドレス未入力' END,
    CASE WHEN NULLIF(TRIM(COALESCE("電話番号", '')), '') IS NULL THEN '電話番号未入力' END
  ) AS "確認結果"
FROM checked
WHERE id_count > 1
   OR NULLIF(TRIM(COALESCE("氏名", '')), '') IS NULL
   OR NULLIF(TRIM(COALESCE("メールアドレス", '')), '') IS NULL
   OR NULLIF(TRIM(COALESCE("電話番号", '')), '') IS NULL
ORDER BY "顧客ID"`,
    output: { fileName: "顧客データ確認結果.csv", encoding: "utf-8-bom", enabled: true },
    files: [customerFile],
  },
];

export function getSampleTemplate(id: string) {
  return sampleTemplates.find((sample) => sample.id === id);
}
