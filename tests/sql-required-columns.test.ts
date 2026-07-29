import assert from "node:assert/strict";
import test from "node:test";
import type { FlowInput } from "../lib/flow-types.ts";
import { applySqlRequiredColumns, requiredColumnsByInput } from "../lib/sql-required-columns.ts";

const inputs: FlowInput[] = [
  {
    id: "sales",
    label: "売上",
    tableName: "input_1",
    encoding: "utf-8",
    delimiter: ",",
    requiredColumns: [
      { name: "商品コード", type: "VARCHAR", required: true },
      { name: "売上金額", type: "DOUBLE", required: true },
      { name: "備考", type: "VARCHAR", required: true },
    ],
  },
  {
    id: "products",
    label: "商品",
    tableName: "input_2",
    encoding: "utf-8",
    delimiter: ",",
    requiredColumns: [
      { name: "商品コード", type: "VARCHAR", required: true },
      { name: "商品名", type: "VARCHAR", required: true },
    ],
  },
];

test("SQLで参照した入力列だけを必須にする", () => {
  const required = requiredColumnsByInput(
    'SELECT s."商品コード", s."売上金額", p."商品名" FROM "input_1" AS s JOIN "input_2" p ON s."商品コード" = p."商品コード"',
    inputs,
  );
  assert.deepEqual([...required.get("input_1")!].sort(), ["商品コード", "売上金額"].sort());
  assert.deepEqual([...required.get("input_2")!].sort(), ["商品コード", "商品名"].sort());
});

test("SELECT *は公開時点の全入力列を必須にする", () => {
  const updated = applySqlRequiredColumns({ sql: "SELECT * FROM input_1", inputs });
  assert.equal(updated.inputs.every((input) => input.requiredColumns.every((column) => column.required)), true);
});

test("テーブル別のワイルドカードは対象入力の全列だけを必須にする", () => {
  const updated = applySqlRequiredColumns({ sql: "SELECT s.*, COUNT(*) AS 件数 FROM input_1 s", inputs });
  assert.equal(updated.inputs[0].requiredColumns.every((column) => column.required), true);
  assert.equal(updated.inputs[1].requiredColumns.every((column) => !column.required), true);
});

test("COUNT(*)や乗算は全列ワイルドカードとして扱わない", () => {
  const updated = applySqlRequiredColumns({
    sql: 'SELECT COUNT(*), "売上金額" * 1.1 AS 税込 FROM input_1',
    inputs,
  });
  assert.deepEqual(
    updated.inputs[0].requiredColumns.filter((column) => column.required).map((column) => column.name),
    ["売上金額"],
  );
});
