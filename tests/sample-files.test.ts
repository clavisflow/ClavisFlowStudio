import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SAMPLE_FILE_BYTES, validateSampleFile } from "../lib/sample-files.ts";

test("公開サンプルはCSV・Excel・JSONだけを許可する", () => {
  assert.equal(validateSampleFile("input-1", new File(["x"], "sample.txt"), {}), "サンプルはCSV、Excel（.xlsx）、JSONに対応しています。");
  assert.equal(validateSampleFile("input-1", new File(["x"], "sample.csv"), {}), undefined);
  assert.equal(validateSampleFile("input-1", new File(["x"], "sample.xlsx"), {}), undefined);
  assert.equal(validateSampleFile("input-1", new File(["x"], "sample.json"), {}), undefined);
});

test("公開サンプルを1ファイル5MB・1処理合計10MBに制限する", () => {
  const tooLarge = new File([new Uint8Array(MAX_SAMPLE_FILE_BYTES + 1)], "large.csv");
  assert.equal(validateSampleFile("input-1", tooLarge, {}), "サンプルは1ファイル5MB以下にしてください。");

  const first = new File([new Uint8Array(MAX_SAMPLE_FILE_BYTES)], "first.csv");
  const second = new File([new Uint8Array(MAX_SAMPLE_FILE_BYTES)], "second.csv");
  assert.equal(validateSampleFile("input-2", second, { "input-1": first }), undefined);
  const overLimit = new File([new Uint8Array(MAX_SAMPLE_FILE_BYTES)], "third.csv");
  assert.equal(
    validateSampleFile("input-3", overLimit, { "input-1": first, "input-2": second }),
    "1処理のサンプル合計は10MB以下にしてください。",
  );
});
