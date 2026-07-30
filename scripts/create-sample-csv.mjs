import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "samples");
await mkdir(target, { recursive: true });

const wideHeaders = [
  "処理日",
  "レコードID",
  ...Array.from({ length: 14 }, (_, index) => `数値${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 14 }, (_, index) => `文字列${String(index + 1).padStart(2, "0")}`),
];
const wideResultLines = [
  wideHeaders.join(","),
  ...Array.from({ length: 135 }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const day = String((rowIndex % 28) + 1).padStart(2, "0");
    const numbers = Array.from({ length: 14 }, (_, columnIndex) => String(rowNumber * (columnIndex + 1) * 1000));
    const texts = Array.from({ length: 14 }, (_, columnIndex) => `値${rowNumber}-${columnIndex + 1}`);
    return [`2026-07-${day}`, `ROW-${String(rowNumber).padStart(3, "0")}`, ...numbers, ...texts].join(",");
  }),
];

const samples = [
  {
    name: "reconciliation-reference-cp932.csv",
    encoding: "cp932",
    lines: [
      "照合キー,基準名称,基準金額",
      "REF-001,サンプルA,12000",
      "REF-002,サンプルB,8500",
      "REF-003,サンプルC,15000",
      "REF-004,サンプルD,4000",
    ],
  },
  {
    name: "reconciliation-actual-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "照合キー,実績日,実績金額",
      "REF-001,2026-07-10,12000",
      "REF-002,2026-07-12,8000",
      "REF-004,2026-07-15,4000",
      "REF-005,2026-07-18,3000",
    ],
  },
  {
    name: "aggregation-shift-jis.csv",
    encoding: "shift_jis",
    lines: [
      "処理日,集計キー,項目名,数量,金額",
      "2026-07-01,K-001,項目A,3,900",
      "2026-07-01,K-002,項目B,10,1200",
      "2026-07-02,K-001,項目A,5,1500",
      "2026-07-03,K-003,項目C,8,640",
      "2026-07-03,K-002,項目B,4,480",
    ],
  },
  {
    name: "generic-details-shift-jis.csv",
    encoding: "shift_jis",
    lines: [
      "処理日,照合キー,項目名,数量,金額",
      "2026-07-01,K-001,入力名A,3,900",
      "2026-07-01,K-002,入力名B,10,1200",
      "2026-07-02,K-001,入力名A,5,1500",
      "2026-07-03,K-003,入力名C,8,640",
    ],
  },
  {
    name: "generic-master-utf8.csv",
    encoding: "utf8",
    lines: [
      "照合キー,名称,分類",
      "K-001,正式名称A,分類1",
      "K-002,正式名称B,分類2",
      "K-003,正式名称C,分類1",
      "K-004,正式名称D,分類3",
    ],
  },
  {
    name: "threshold-check-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "項目コード,項目名,現在値,予定値,基準値",
      "K-001,項目A,8,5,20",
      "K-002,項目B,24,0,20",
      "K-003,項目C,3,2,15",
      "K-004,項目D,10,20,25",
    ],
  },
  {
    name: "data-quality-check-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "ID,名称,必須項目1,必須項目2",
      "R-001,サンプルA,値A1,値A2",
      "R-002,サンプルB,,値B2",
      "R-002,サンプルB,値B1,",
      "R-003,,値C1,値C2",
      "R-004,サンプルD,値D1,値D2",
    ],
  },
  {
    name: "latest-records-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,更新日,名称,状態",
      "R-001,2026-06-01,サンプルA,受付",
      "R-001,2026-07-10,サンプルA,完了",
      "R-002,2026-07-03,サンプルB,確認中",
      "R-002,2026-07-20,サンプルB,完了",
      "R-003,2026-07-15,サンプルC,受付",
    ],
  },
  {
    name: "duplicate-rows-utf8.csv",
    encoding: "utf8",
    lines: [
      "コード,名称,数量",
      "K-001,サンプルA,10",
      "K-001,サンプルA,10",
      "K-002,サンプルB,5",
      "K-003,サンプルC,8",
      "K-003,サンプルC,8",
    ],
  },
  {
    name: "diff-before-utf8.csv",
    encoding: "utf8",
    lines: [
      "照合キー,比較値",
      "K-001,値A",
      "K-002,値B",
      "K-003,値C",
      "K-004,値D",
    ],
  },
  {
    name: "diff-after-utf8.csv",
    encoding: "utf8",
    lines: [
      "照合キー,比較値",
      "K-001,値A",
      "K-002,変更後B",
      "K-004,値D",
      "K-005,値E",
    ],
  },
  {
    name: "replacement-data-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,変換対象値",
      "R-001,A01",
      "R-002,B02",
      "R-003,C03",
      "R-004,X99",
    ],
  },
  {
    name: "replacement-map-utf8.csv",
    encoding: "utf8",
    lines: [
      "変換前,変換後",
      "A01,分類A",
      "B02,分類B",
      "C03,分類C",
    ],
  },
  {
    name: "append-part-1-utf8.csv",
    encoding: "utf8",
    lines: [
      "処理日,コード,金額",
      "2026-07-01,K-001,1200",
      "2026-07-02,K-002,800",
    ],
  },
  {
    name: "append-part-2-utf8.csv",
    encoding: "utf8",
    lines: [
      "処理日,コード,金額",
      "2026-07-03,K-003,1500",
      "2026-07-04,K-004,600",
    ],
  },
  {
    name: "date-parts-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,日付,名称",
      "R-001,2026-03-31,サンプルA",
      "R-002,2026-04-01,サンプルB",
      "R-003,2026-07-15,サンプルC",
      "R-004,2027-01-10,サンプルD",
    ],
  },
  {
    name: "text-normalization-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,文字列",
      "R-001,  SAMPLE A  ",
      "R-002,Sample   B",
      "R-003,  サンプル C",
      "R-004,MIXED Case",
    ],
  },
  {
    name: "invalid-values-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,数値項目,日付項目",
      "R-001,1200,2026-07-01",
      "R-002,未設定,2026-07-02",
      "R-003,800,日付不明",
      "R-004,,2026-07-04",
      "R-005,500,",
    ],
  },
  {
    name: "elapsed-days-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,開始日,終了日",
      "R-001,2026-07-01,2026-07-10",
      "R-002,2026-07-15,2026-07-15",
      "R-003,2026-07-20,2026-07-18",
      "R-004,2026-06-01,2026-07-30",
    ],
  },
  {
    name: "master-check-details-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,照合キー",
      "R-001,K-001",
      "R-002,K-002",
      "R-003,K-005",
      "R-004,K-006",
    ],
  },
  {
    name: "wide-to-long-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,1月,2月,3月",
      "R-001,1200,1500,1800",
      "R-002,800,950,1100",
      "R-003,2000,1900,2200",
    ],
  },
  {
    name: "long-to-wide-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,区分,値",
      "R-001,1月,1200",
      "R-001,2月,1500",
      "R-001,3月,1800",
      "R-002,1月,800",
      "R-002,2月,950",
      "R-002,3月,1100",
    ],
  },
  {
    name: "previous-difference-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,日付,値",
      "K-001,2026-05-01,1000",
      "K-001,2026-06-01,1250",
      "K-001,2026-07-01,1100",
      "K-002,2026-05-01,800",
      "K-002,2026-06-01,1000",
      "K-002,2026-07-01,1200",
    ],
  },
  {
    name: "overlapping-periods-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,対象キー,開始日,終了日",
      "R-001,K-001,2026-07-01,2026-07-10",
      "R-002,K-001,2026-07-08,2026-07-15",
      "R-003,K-001,2026-07-20,2026-07-25",
      "R-004,K-002,2026-07-01,2026-07-05",
      "R-005,K-002,2026-07-05,2026-07-12",
    ],
  },
  {
    name: "input-status-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,名称,メール,区分",
      "R-001,サンプルA,sample-a@example.com,A",
      "R-002,サンプルB,,A",
      "R-003,,sample-c@example.com,B",
      "R-004,サンプルD,,B",
      "R-005,サンプルE,sample-e@example.com,A",
    ],
  },
  {
    name: "duplicate-keys-utf8.csv",
    encoding: "utf8",
    lines: [
      "照合キー,名称,金額",
      "K-001,サンプルA,1200",
      "K-001,サンプルA別行,800",
      "K-002,サンプルB,1500",
      "K-003,サンプルC,600",
      "K-003,サンプルC別行,700",
      "K-003,サンプルC追加,500",
    ],
  },
  {
    name: "sequence-gaps-utf8.csv",
    encoding: "utf8",
    lines: [
      "グループキー,連番,日付",
      "G-001,1,2026-07-01",
      "G-001,2,2026-07-02",
      "G-001,4,2026-07-04",
      "G-001,5,2026-07-07",
      "G-002,10,2026-07-01",
      "G-002,11,2026-07-02",
    ],
  },
  {
    name: "delimited-values-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,値一覧",
      "R-001,\"A,B,C\"",
      "R-002,D、E",
      "R-003,\"F;G\"",
      "R-004,H",
    ],
  },
  {
    name: "outliers-utf8.csv",
    encoding: "utf8",
    lines: [
      "ID,値",
      "R-001,10",
      "R-002,11",
      "R-003,12",
      "R-004,10",
      "R-005,13",
      "R-006,12",
      "R-007,11",
      "R-008,100",
    ],
  },
  {
    name: "subtotal-utf8.csv",
    encoding: "utf8",
    lines: [
      "集計キー,金額",
      "分類A,1200",
      "分類A,800",
      "分類B,1500",
      "分類B,500",
      "分類C,900",
    ],
  },
  {
    name: "wide-result-test-utf8.csv",
    encoding: "utf8",
    lines: wideResultLines,
  },
];

for (const sample of samples) {
  const text = `${sample.lines.join("\r\n")}\r\n`;
  let bytes;
  if (sample.encoding === "utf8-bom") bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
  else if (sample.encoding === "utf8") bytes = Buffer.from(text, "utf8");
  else bytes = iconv.encode(text, sample.encoding);
  await writeFile(join(target, sample.name), bytes);
}

console.log(`Created ${samples.length} sample CSV files in public/samples`);
