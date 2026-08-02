import { HttpError } from "./errors.ts";
import { assertSafeSql } from "./validation.ts";

const inputColumnTypes = new Set(["VARCHAR", "BIGINT", "DOUBLE", "DATE", "BOOLEAN"]);
const maxAiSampleColumns = 80;
const aiSampleRows = 5;

export type AiInputSchema = {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
};

export type GeneratedSql = {
  sql: string;
  summary: string;
  warnings: string[];
  samples?: Record<string, Array<Record<string, string | number | boolean | null>>>;
};

function generatedSqlJsonSchema(inputs: AiInputSchema[]) {
  const canGenerateSamples = canGenerateAiSamples(inputs);
  const samplesObject = {
    type: "object",
    properties: Object.fromEntries(inputs.map((input) => [
      input.tableName,
      {
        type: "array",
        minItems: aiSampleRows,
        maxItems: aiSampleRows,
        items: {
          type: "object",
          properties: Object.fromEntries(input.columns.map((column) => [
            column.name,
            sampleValueSchema(column.type),
          ])),
          required: input.columns.map((column) => column.name),
          additionalProperties: false,
        },
      },
    ])),
    required: inputs.map((input) => input.tableName),
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      sql: { type: "string" },
      summary: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
      samples: canGenerateSamples ? { anyOf: [samplesObject, { type: "null" }] } : { type: "null" },
    },
    required: ["sql", "summary", "warnings", "samples"],
    additionalProperties: false,
  };
}

function sampleValueSchema(type: string) {
  const primitive = type === "BIGINT" ? "integer" : type === "DOUBLE" ? "number" : type === "BOOLEAN" ? "boolean" : "string";
  return { anyOf: [{ type: primitive }, { type: "null" }] };
}

const systemPrompt = `You generate DuckDB SQL for ClavisFlow Studio.
Return one read-only query that implements the user's Japanese instruction.

Rules:
- Use only the supplied table names and column names.
- Return exactly one SELECT statement. A WITH clause followed by SELECT is allowed.
- Quote every supplied table name, column name, and output alias with the ASCII double quote character ("). Never substitute Japanese brackets or typographic quotes such as 「, 」, “, or ”.
- Never use DDL, DML, COPY, PRAGMA, ATTACH, INSTALL, LOAD, external URLs, file readers, table functions, extensions, or multiple statements.
- Prefer TRY_CAST when a value may not be safely convertible.
- When a supplied column is VARCHAR, never compare it directly with a numeric or date literal. Parse it with TRY_CAST or an appropriate text transformation first.
- Preserve text values exactly as written in the user's instruction. Do not add TRANSLATE, REPLACE, UPPER, LOWER, trimming, width conversion, or other value normalization unless the user explicitly requests that normalization.
- After UNION, UNION ALL, INTERSECT, or EXCEPT, the final ORDER BY may reference only output columns or their positions. If sorting needs CASE or another expression, wrap the complete set operation in a subquery or CTE and apply ORDER BY in an outer SELECT.
- Give output columns clear Japanese aliases when appropriate.
- Do not invent a column. If the instruction cannot be satisfied with the supplied schema, return the safest useful query and explain the limitation in warnings.
- summary must be a concise Japanese explanation of the query.
- warnings must be Japanese messages and may be an empty array.
- When generateSamples is true, samples must contain exactly 5 useful editing rows for every supplied table. When it is false, return samples as null and do not add a warning solely about the absence of samples.
- Every sample row must contain every supplied column and use its declared data type. DATE values must use YYYY-MM-DD.
- Make JOIN keys match across tables where the query needs matches, while also including a few unmatched, null, duplicate, or boundary cases when useful.
- Use clearly fictional values only. Never include real personal information, URLs, executable formulas, or secrets.
- The samples are private editing data and are not published automatically.

The CSV rows themselves are not provided. Infer nothing about their values.`;

export function parseAiInputSchemas(value: unknown): AiInputSchema[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new HttpError(400, "入力スキーマは1～2件必要です。");
  }

  return value.map((candidate, inputIndex) => {
    if (!candidate || typeof candidate !== "object") throw new HttpError(400, `入力${inputIndex + 1}の定義が不正です。`);
    const record = candidate as Record<string, unknown>;
    const tableName = typeof record.tableName === "string" ? record.tableName.trim() : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(tableName)) {
      throw new HttpError(400, `入力${inputIndex + 1}のテーブル名が不正です。`);
    }
    if (!Array.isArray(record.columns) || record.columns.length < 1 || record.columns.length > 300) {
      throw new HttpError(400, `入力${inputIndex + 1}の列定義は1～300件必要です。`);
    }

    const seen = new Set<string>();
    const columns = record.columns.map((candidateColumn, columnIndex) => {
      if (!candidateColumn || typeof candidateColumn !== "object") {
        throw new HttpError(400, `入力${inputIndex + 1}の列${columnIndex + 1}が不正です。`);
      }
      const column = candidateColumn as Record<string, unknown>;
      const name = typeof column.name === "string" ? column.name.trim() : "";
      const type = typeof column.type === "string" ? column.type.toUpperCase() : "";
      if (!name || name.length > 256 || /[\u0000-\u001f\u007f]/.test(name)) {
        throw new HttpError(400, `入力${inputIndex + 1}の列名が不正です。`);
      }
      if (seen.has(name)) throw new HttpError(400, `入力${inputIndex + 1}に同名の列があります: ${name}`);
      if (!inputColumnTypes.has(type)) throw new HttpError(400, `${name}のデータ型が不正です。`);
      seen.add(name);
      return { name, type };
    });
    return { tableName, columns };
  });
}

export function buildResponsesRequest(model: string, instruction: string, inputs: AiInputSchema[], reasoningEffort = "low") {
  const allowedEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  const effort = allowedEfforts.has(reasoningEffort) ? reasoningEffort : "low";
  const columnCount = inputs.reduce((total, input) => total + input.columns.length, 0);
  const generateSamples = canGenerateAiSamples(inputs);
  return {
    model,
    store: false,
    max_output_tokens: generateSamples ? Math.min(12000, 5000 + columnCount * 100) : 5000,
    reasoning: { effort },
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          instruction,
          inputs,
          generateSamples,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "clavisflow_duckdb_sql",
        strict: true,
        schema: generatedSqlJsonSchema(inputs),
      },
    },
  };
}

function canGenerateAiSamples(inputs: AiInputSchema[]) {
  return inputs.reduce((total, input) => total + input.columns.length, 0) <= maxAiSampleColumns;
}

export function parseResponsesResult(value: unknown, inputs: AiInputSchema[] = []): GeneratedSql {
  if (!value || typeof value !== "object") throw new HttpError(502, "AI APIから不正な応答が返されました。");
  const response = value as Record<string, unknown>;
  if (response.status === "incomplete") {
    const details = response.incomplete_details as Record<string, unknown> | undefined;
    const suffix = details?.reason === "max_output_tokens" ? " 出力が長すぎます。処理指示を簡潔にしてください。" : "";
    throw new HttpError(502, `AIによるSQL生成が完了しませんでした。${suffix}`.trim());
  }

  let outputText = typeof response.output_text === "string" ? response.output_text : undefined;
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item || typeof item !== "object" || (item as Record<string, unknown>).type !== "message") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const record = part as Record<string, unknown>;
        if (record.type === "refusal") {
          throw new HttpError(422, typeof record.refusal === "string" && record.refusal.trim()
            ? `AIがSQL生成を拒否しました: ${record.refusal.trim()}`
            : "AIがSQL生成を拒否しました。処理指示を見直してください。");
        }
        if (!outputText && record.type === "output_text" && typeof record.text === "string") outputText = record.text;
      }
    }
  }
  if (!outputText) throw new HttpError(502, "AI APIの応答にSQLがありません。");

  let parsed: unknown;
  try { parsed = JSON.parse(outputText); }
  catch { throw new HttpError(502, "AI APIの構造化応答を解析できませんでした。"); }
  if (!parsed || typeof parsed !== "object") throw new HttpError(502, "AI APIの構造化応答が不正です。");
  const generated = parsed as Record<string, unknown>;
  const sql = typeof generated.sql === "string" ? generated.sql.trim() : "";
  const summary = typeof generated.summary === "string" ? generated.summary.trim() : "";
  if (!summary || summary.length > 500) throw new HttpError(502, "AI APIの要約が不正です。");
  if (!Array.isArray(generated.warnings) || generated.warnings.length > 10 || generated.warnings.some((warning) => typeof warning !== "string" || !warning.trim() || warning.length > 500)) {
    throw new HttpError(502, "AI APIの警告情報が不正です。");
  }
  try { assertSafeSql(sql); }
  catch (error) {
    const detail = error instanceof Error ? error.message : "安全性を確認できませんでした。";
    throw new HttpError(422, `生成されたSQLを安全性検査で拒否しました: ${detail}`);
  }
  let warnings = generated.warnings.map((warning) => String(warning).trim());
  const { samples, failureReason } = parseGeneratedSamples(generated.samples, inputs);
  if (inputs.length && !samples) {
    warnings = [
      ...warnings.filter((warning) => !isAiSampleGenerationWarning(warning)),
      `${failureReason ?? "AIサンプルを検証できなかった"}ため、編集用AIサンプルを使用できませんでした。SQLだけを使用します。`,
    ];
  }
  return { sql, summary, warnings, samples };
}

function isAiSampleGenerationWarning(warning: string) {
  return /(?:AI|編集用).{0,10}サンプル|サンプル.{0,12}(?:生成|作成)(?:でき|され|し)/u.test(warning);
}

function parseGeneratedSamples(value: unknown, inputs: AiInputSchema[]): { samples?: GeneratedSql["samples"]; failureReason?: string } {
  if (!inputs.length) return {};
  const columnCount = inputs.reduce((total, input) => total + input.columns.length, 0);
  if (!canGenerateAiSamples(inputs)) {
    return { failureReason: `入力列が合計${columnCount}列あり、生成上限の${maxAiSampleColumns}列を超えている` };
  }
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AIがサンプルデータを返さなかった");
    const sampleRecord = value as Record<string, unknown>;
    const expectedTables = new Set(inputs.map((input) => input.tableName));
    if (Object.keys(sampleRecord).some((tableName) => !expectedTables.has(tableName))) throw new Error("AIが返したサンプルの入力名が一致しなかった");
    const result: NonNullable<GeneratedSql["samples"]> = {};
    for (const input of inputs) {
      const rows = sampleRecord[input.tableName];
      if (!Array.isArray(rows) || rows.length < 5 || rows.length > 20) throw new Error("AIが返したサンプルの行数が不足または超過していた");
      const expectedColumns = new Set(input.columns.map((column) => column.name));
      result[input.tableName] = rows.map((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("AIが返したサンプルに表形式ではない行が含まれていた");
        const row = candidate as Record<string, unknown>;
        if (Object.keys(row).length !== expectedColumns.size || Object.keys(row).some((column) => !expectedColumns.has(column))) throw new Error("AIが返したサンプルの列構成が入力と一致しなかった");
        return Object.fromEntries(input.columns.map((column) => {
          const cell = row[column.name];
          if (!validSampleValue(cell, column.type)) throw new Error("AIが返したサンプルに列のデータ型と合わない値が含まれていた");
          return [column.name, cell];
        }));
      });
    }
    if (JSON.stringify(result).length > 250_000) throw new Error("AIが返したサンプルのデータ量が上限を超えていた");
    return { samples: result };
  } catch (error) {
    return { failureReason: error instanceof Error ? error.message : "AIサンプルを検証できなかった" };
  }
}

function validSampleValue(value: unknown, type: string): value is string | number | boolean | null {
  if (value === null) return true;
  if (type === "BIGINT") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "DOUBLE") return typeof value === "number" && Number.isFinite(value);
  if (type === "BOOLEAN") return typeof value === "boolean";
  if (typeof value !== "string" || value.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return false;
  return type !== "DATE" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}
