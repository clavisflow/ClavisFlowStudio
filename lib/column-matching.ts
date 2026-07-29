import type { FileAnalysis, InputColumn } from "./flow-types";

export type ColumnMatchStatus = "automatic" | "review" | "unmapped";

export type ColumnMatch = {
  source?: string;
  score: number;
  status: ColumnMatchStatus;
};

const aliases: Record<string, string[]> = {
  売上日: ["日付", "販売日", "取引日", "salesdate", "orderdate"],
  売上金額: ["金額", "売上", "販売金額", "合計金額", "salesamount", "amount"],
  商品コード: ["商品cd", "品番", "sku", "productcode", "itemcode"],
  店舗コード: ["店舗cd", "店コード", "拠点コード", "shopcode", "storecode"],
  商品名: ["品名", "商品", "productname", "itemname"],
  数量: ["個数", "販売数量", "qty", "quantity"],
  請求番号: ["請求no", "請求書番号", "invoiceid", "invoiceno", "invoicenumber"],
  請求金額: ["請求額", "請求合計", "invoiceamount", "billedamount"],
  入金額: ["入金金額", "支払額", "paymentamount", "paidamount"],
  顧客ID: ["顧客番号", "顧客コード", "customerid", "customercode"],
  氏名: ["名前", "顧客名", "name", "fullname"],
  メールアドレス: ["メール", "email", "mailaddress"],
  電話番号: ["電話", "tel", "phone", "phonenumber"],
  現在庫: ["在庫", "在庫数", "stock", "currentstock"],
  入荷予定: ["入荷予定数", "入荷数", "incoming", "scheduledstock"],
  発注点: ["安全在庫", "reorderpoint", "minimumstock"],
};

export function normalizeColumnName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s\-_.・/\\()[\]{}:：,，]/g, "");
}

export function inferColumnMatches(requiredColumns: InputColumn[], analysis: FileAnalysis): Record<string, ColumnMatch> {
  const used = new Set<string>();
  const matches: Record<string, ColumnMatch> = {};

  for (const required of requiredColumns) {
    const candidates = analysis.headers
      .filter((header) => !used.has(header))
      .map((header, index) => ({
        header,
        score: scoreColumn(required, header, analysis.columnTypes[index], analysis.sampleValues[header] ?? []),
      }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (!best || best.score < 0.58) {
      matches[required.name] = { score: best?.score ?? 0, status: "unmapped" };
      continue;
    }
    used.add(best.header);
    matches[required.name] = {
      source: best.header,
      score: best.score,
      status: best.score >= 0.86 ? "automatic" : "review",
    };
  }
  return matches;
}

function scoreColumn(required: InputColumn, header: string, actualType: InputColumn["type"], samples: string[]): number {
  if (header === required.name) return 1;
  const normalizedRequired = normalizeColumnName(required.name);
  const normalizedHeader = normalizeColumnName(header);
  if (normalizedRequired === normalizedHeader) return 0.96;

  const normalizedAliases = (aliases[required.name] ?? []).map(normalizeColumnName);
  if (normalizedAliases.includes(normalizedHeader)) return 0.91;

  const comparedNames = [normalizedRequired, ...normalizedAliases];
  const nameScore = Math.max(...comparedNames.map((candidate) => Math.max(
    levenshteinSimilarity(candidate, normalizedHeader),
    jaroWinklerSimilarity(candidate, normalizedHeader),
    partialSimilarity(candidate, normalizedHeader),
  )));
  const typeScore = compatibleType(required.type, actualType) ? 0.08 : 0;
  const sampleScore = sampleLooksCompatible(required.type, samples) ? 0.05 : 0;
  return Math.min(0.84, nameScore * 0.76 + typeScore + sampleScore);
}

function compatibleType(required: InputColumn["type"], actual: InputColumn["type"]) {
  if (required === actual) return true;
  return (required === "DOUBLE" && actual === "BIGINT") || (required === "VARCHAR" && actual !== "BOOLEAN");
}

function sampleLooksCompatible(type: InputColumn["type"], values: string[]) {
  const populated = values.filter(Boolean);
  if (!populated.length) return false;
  if (type === "DOUBLE" || type === "BIGINT") return populated.every((value) => !Number.isNaN(Number(value.replaceAll(",", ""))));
  if (type === "DATE") return populated.every((value) => !Number.isNaN(Date.parse(value)));
  if (type === "BOOLEAN") return populated.every((value) => /^(true|false|0|1|はい|いいえ)$/i.test(value));
  return true;
}

function levenshteinSimilarity(left: string, right: string) {
  if (!left.length || !right.length) return 0;
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let diagonal = rows[0];
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const previous = rows[leftIndex];
      rows[leftIndex] = Math.min(
        rows[leftIndex] + 1,
        rows[leftIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return 1 - rows[left.length] / Math.max(left.length, right.length);
}

function partialSimilarity(left: string, right: string) {
  if (!left.length || !right.length || (!left.includes(right) && !right.includes(left))) return 0;
  return 0.82 + 0.14 * (Math.min(left.length, right.length) / Math.max(left.length, right.length));
}

function jaroWinklerSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;
  const distance = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatches = new Array(left.length).fill(false) as boolean[];
  const rightMatches = new Array(right.length).fill(false) as boolean[];
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - distance);
    const end = Math.min(leftIndex + distance + 1, right.length);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) continue;
      leftMatches[leftIndex] = true;
      rightMatches[rightIndex] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;

  const leftOrdered = [...left].filter((_, index) => leftMatches[index]);
  const rightOrdered = [...right].filter((_, index) => rightMatches[index]);
  const transpositions = leftOrdered.reduce((total, character, index) => total + (character === rightOrdered[index] ? 0 : 1), 0) / 2;
  const jaro = (
    matches / left.length +
    matches / right.length +
    (matches - transpositions) / matches
  ) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, left.length, right.length) && left[prefix] === right[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}
