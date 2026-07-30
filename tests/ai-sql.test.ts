import assert from "node:assert/strict";
import test from "node:test";
import { buildResponsesRequest, parseAiInputSchemas, parseResponsesResult } from "../supabase/functions/_shared/ai-sql.ts";

const inputs = [
  { tableName: "input_1", columns: [{ name: "請求番号", type: "VARCHAR" }, { name: "請求金額", type: "DOUBLE" }] },
  { tableName: "input_2", columns: [{ name: "請求番号", type: "VARCHAR" }, { name: "入金額", type: "DOUBLE" }] },
];

test("Responses API request sends schema only and requires structured output", () => {
  const request = buildResponsesRequest("gpt-5.6-terra", "請求と入金を照合して。", parseAiInputSchemas(inputs));
  assert.equal(request.store, false);
  assert.equal(request.model, "gpt-5.6-terra");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  const serialized = JSON.stringify(request);
  assert.match(serialized, /請求番号/);
  assert.match(serialized, /generateSamples/);
  assert.match(serialized, /samples/);
  assert.doesNotMatch(serialized, /CSVの行データ/);
});

test("Responses API structured result is parsed and safety-checked", () => {
  const parsedInputs = parseAiInputSchemas(inputs);
  const result = parseResponsesResult({
    status: "completed",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          sql: 'SELECT "請求番号", SUM("請求金額") AS "請求合計" FROM "input_1" GROUP BY "請求番号"',
          summary: "請求番号ごとの請求額を集計します。",
          warnings: [],
          samples: {
            input_1: Array.from({ length: 5 }, (_, index) => ({ 請求番号: `請求${index + 1}`, 請求金額: 1000 + index })),
            input_2: Array.from({ length: 5 }, (_, index) => ({ 請求番号: `請求${index + 1}`, 入金額: 1000 + index })),
          },
        }),
      }],
    }],
  }, parsedInputs);
  assert.match(result.sql, /^SELECT/);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.samples?.input_1.length, 5);
});

test("invalid editing samples do not discard otherwise safe SQL", () => {
  const result = parseResponsesResult({
    status: "completed",
    output_text: JSON.stringify({
      sql: 'SELECT "請求番号" FROM "input_1"',
      summary: "請求番号を表示します。",
      warnings: [],
      samples: { input_1: [{ 請求番号: "請求1" }] },
    }),
  }, parseAiInputSchemas(inputs));
  assert.equal(result.samples, undefined);
  assert.match(result.warnings.at(-1) ?? "", /AIサンプル/);
});

test("unsafe generated SQL is rejected", () => {
  assert.throws(() => parseResponsesResult({
    status: "completed",
    output_text: JSON.stringify({ sql: "COPY input_1 TO 'out.csv'", summary: "出力します。", warnings: [] }),
  }), /安全性検査で拒否/);
});

test("generated SQL may use the REPLACE scalar function", () => {
  const result = parseResponsesResult({
    status: "completed",
    output_text: JSON.stringify({
      sql: `SELECT REPLACE("請求番号", '-', '') AS "請求番号" FROM "input_1"`,
      summary: "請求番号からハイフンを除去します。",
      warnings: [],
      samples: null,
    }),
  });
  assert.match(result.sql, /REPLACE\(/);
});

test("invalid AI input schemas are rejected before an API call", () => {
  assert.throws(() => parseAiInputSchemas([{ tableName: "input_1; DROP", columns: inputs[0].columns }]), /テーブル名が不正/);
  assert.throws(() => parseAiInputSchemas([{ tableName: "input_1", columns: [{ name: "列", type: "BLOB" }] }]), /データ型が不正/);
});
