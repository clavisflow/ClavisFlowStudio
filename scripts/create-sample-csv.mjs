import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "samples");
await mkdir(target, { recursive: true });

const samples = [
  {
    name: "invoices-cp932.csv",
    encoding: "cp932",
    lines: [
      "請求番号,請求先,請求金額",
      "INV-001,青葉商事,12000",
      "INV-002,港産業,8500",
      "INV-003,北斗サービス,15000",
      "INV-004,山川物流,4000",
    ],
  },
  {
    name: "payments-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "請求番号,入金日,入金額",
      "INV-001,2026-07-10,12000",
      "INV-002,2026-07-12,8000",
      "INV-004,2026-07-15,4000",
      "INV-005,2026-07-18,3000",
    ],
  },
  {
    name: "sales-shift-jis.csv",
    encoding: "shift_jis",
    lines: [
      "売上日,商品コード,商品名,数量,売上金額",
      "2026-07-01,P-001,ノート,3,900",
      "2026-07-01,P-002,ボールペン,10,1200",
      "2026-07-02,P-001,ノート,5,1500",
      "2026-07-03,P-003,クリップ,8,640",
      "2026-07-03,P-002,ボールペン,4,480",
    ],
  },
  {
    name: "product-master-utf8.csv",
    encoding: "utf8",
    lines: [
      "商品コード,商品名,分類",
      "P-001,大学ノート,文具",
      "P-002,油性ボールペン,筆記具",
      "P-003,ゼムクリップ,事務用品",
      "P-004,コピー用紙,用紙",
    ],
  },
  {
    name: "inventory-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "商品コード,商品名,現在庫,発注点,入荷予定",
      "P-001,大学ノート,8,20,5",
      "P-002,油性ボールペン,24,20,0",
      "P-003,ゼムクリップ,3,15,2",
      "P-004,コピー用紙,10,25,20",
    ],
  },
  {
    name: "customers-utf8-bom.csv",
    encoding: "utf8-bom",
    lines: [
      "顧客ID,氏名,メールアドレス,電話番号",
      "C-001,佐藤商店,sato@example.jp,03-1234-5678",
      "C-002,鈴木物産,,06-2345-6789",
      "C-002,鈴木物産,suzuki@example.jp,",
      "C-003,,tanaka@example.jp,052-345-6789",
      "C-004,高橋工業,takahashi@example.jp,045-456-7890",
    ],
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
