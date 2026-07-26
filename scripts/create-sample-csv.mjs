import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "samples");
await mkdir(target, { recursive: true });
const payments = [
  "請求番号,入金額",
  "INV-001,12000",
  "INV-002,8000",
  "INV-004,4000",
  "INV-005,3000",
  "",
].join("\r\n");
await writeFile(join(target, "payments-cp932.csv"), iconv.encode(payments, "cp932"));
console.log("Created samples/payments-cp932.csv");
