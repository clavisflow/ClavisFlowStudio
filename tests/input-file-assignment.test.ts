import assert from "node:assert/strict";
import test from "node:test";
import { assignFilesToInputs, assignNamedFilesToInputs, csvRecordAt } from "../lib/input-file-assignment.ts";
import type { FlowInput } from "../lib/flow-types.ts";

function input(id: string, label: string, fileName?: string): FlowInput {
  return { id, label, fileName, tableName: id, encoding: "auto", delimiter: ",", requiredColumns: [] };
}

test("複数入力では選択順ではなく保存元ファイル名で割り当てる", () => {
  const inputs = [
    input("master", "都道府県マスタ", "codebook_2024.xlsx"),
    input("accidents", "交通事故", "honhyo_2024.csv"),
  ];
  const honhyo = { name: "honhyo_2024.csv" };
  const result = assignNamedFilesToInputs(inputs, [honhyo]);
  assert.equal(result.assignments[0].input.id, "accidents");
});

test("保存元ファイル名がない既存処理は入力名と拡張子なしで照合する", () => {
  const inputs = [input("master", "codebook_2024"), input("accidents", "honhyo_2024")];
  const files = [{ name: "honhyo_2024.csv" }, { name: "codebook_2024.xlsx" }];
  const result = assignNamedFilesToInputs(inputs, files);
  assert.deepEqual(result.assignments.map(({ input: assigned }) => assigned.id), ["accidents", "master"]);
});

test("入力名を変更した既存処理でもCSVの必要列から割り当てる", async () => {
  const inputs = [
    { ...input("master", "都道府県マスタ"), headerRow: 6, requiredColumns: [
      { name: "都道府県コード", type: "VARCHAR" as const, required: true },
      { name: "都道府県名", type: "VARCHAR" as const, required: true },
    ] },
    { ...input("accidents", "交通事故データ"), headerRow: 6, requiredColumns: [
      { name: "都道府県コード", type: "VARCHAR" as const, required: true },
      { name: "曜日(発生年月日)", type: "VARCHAR" as const, required: true },
    ] },
  ];
  const csv = "都道府県コード,曜日(発生年月日),事故内容\r\n13,2,1\r\n";
  const selected = new File([csv], "honhyo_2024.csv");
  const result = await assignFilesToInputs(inputs, [{ name: selected.name, file: selected }]);
  assert.equal(result.assignments[0].input.id, "accidents");
});

test("引用符内の改行を含むCSVでも指定ヘッダー行を取り出す", () => {
  assert.deepEqual(csvRecordAt('説明,値\r\n"1行目\r\n2行目",10\r\nコード,名称\r\n', ",", 3), ["コード", "名称"]);
});
