import type { ResultColumnKind } from "./flow-types.ts";

export function formatElapsedSeconds(elapsedMs: number) {
  return `${(elapsedMs / 1000).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 3 })}秒`;
}

export function resultColumnKind(typeName: string): ResultColumnKind {
  const normalized = typeName.toLowerCase();
  if (normalized.includes("timestamp")) return "datetime";
  if (normalized.includes("date")) return "date";
  if (/\b(bool|boolean)\b/.test(normalized)) return "boolean";
  if (/(u?int|float|double|decimal|numeric|real)/.test(normalized)) return "number";
  return "text";
}

export function normalizeResultValue(value: unknown, kind: ResultColumnKind): string | number | boolean | null {
  if (value == null) return null;
  if (kind === "date") return normalizeDate(value, false);
  if (kind === "datetime") return normalizeDate(value, true);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function isNumericResultValue(value: unknown, kind?: ResultColumnKind) {
  if (kind === "number") return true;
  return (typeof value === "number" && Number.isFinite(value)) || typeof value === "bigint";
}

export function formatResultValue(value: unknown, kind?: ResultColumnKind) {
  if (value == null) return "—";
  if (kind === "date") return formatIsoDate(String(value));
  if (kind === "datetime") return formatIsoDateTime(String(value));
  if (kind === "number" && typeof value === "string") return formatNumericString(value);
  if (typeof value === "bigint") return value.toLocaleString("ja-JP");
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("ja-JP", { maximumFractionDigits: 20 });
  return String(value);
}

function normalizeDate(value: unknown, includeTime: boolean): string {
  if (typeof value === "string") {
    const iso = /^\d{4}-\d{2}-\d{2}(?:[T ][^\s]+)?/.exec(value)?.[0];
    if (iso) return includeTime ? iso.replace(" ", "T") : iso.slice(0, 10);
  }
  const numeric = typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : NaN;
  const date = value instanceof Date
    ? value
    : Number.isFinite(numeric)
      ? new Date(Math.abs(numeric) < 10_000_000 ? numeric * 86_400_000 : numeric)
      : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return includeTime ? date.toISOString() : date.toISOString().slice(0, 10);
}

function formatIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
}

function formatIsoDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function formatNumericString(value: string) {
  const trimmed = value.trim();
  const match = /^([+-]?)(\d+)(\.\d+)?$/.exec(trimmed);
  if (!match) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric.toLocaleString("ja-JP", { maximumFractionDigits: 20 }) : value;
  }
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${match[1]}${grouped}${match[3] ?? ""}`;
}
