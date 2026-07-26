import type { EffectiveEncoding, PublicFlow } from "./flow-types";

export const DEMO_PUBLIC_ID = "invoice-payment-check";

export const demoFlow: PublicFlow = {
  publicId: DEMO_PUBLIC_ID,
  name: "請求・入金チェック",
  description: "請求番号で請求CSVと入金CSVを照合し、一致・金額不一致・未入金・請求なし入金に分類します。",
  version: 1,
  inputs: [
    {
      id: "invoices",
      label: "請求CSV",
      tableName: "invoices",
      encoding: "auto",
      delimiter: ",",
      requiredColumns: [
        { name: "請求番号", type: "VARCHAR", required: true },
        { name: "請求金額", type: "DOUBLE", required: true },
      ],
    },
    {
      id: "payments",
      label: "入金CSV",
      tableName: "payments",
      encoding: "auto",
      delimiter: ",",
      requiredColumns: [
        { name: "請求番号", type: "VARCHAR", required: true },
        { name: "入金額", type: "DOUBLE", required: true },
      ],
    },
  ],
  sql: `WITH invoice_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("請求金額" AS DOUBLE)) AS billed
  FROM invoices GROUP BY 1
), payment_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("入金額" AS DOUBLE)) AS paid
  FROM payments GROUP BY 1
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
  output: { fileName: "請求入金チェック結果.csv", encoding: "utf-8-bom" },
  duckdbVersion: "1.32.0",
};

export interface BundledSampleFile {
  name: string;
  url: string;
  encoding: EffectiveEncoding;
  headers: string[];
}

const demoSampleFiles: Record<string, BundledSampleFile> = {
  invoices: {
    name: "サンプル請求.csv",
    url: "/samples/invoices-cp932.csv",
    encoding: "cp932",
    headers: ["請求番号", "請求先", "請求金額"],
  },
  payments: {
    name: "サンプル入金.csv",
    url: "/samples/payments-utf8-bom.csv",
    encoding: "utf-8-bom",
    headers: ["請求番号", "入金日", "入金額"],
  },
};

export function getBundledDemo(publicId: string): PublicFlow | undefined {
  return publicId === DEMO_PUBLIC_ID ? demoFlow : undefined;
}

export function getBundledSampleFiles(publicId: string): Record<string, BundledSampleFile> | undefined {
  return publicId === DEMO_PUBLIC_ID ? demoSampleFiles : undefined;
}
