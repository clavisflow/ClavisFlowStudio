import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeSql } from "../supabase/functions/_shared/validation.ts";

test("Supabase側はREPLACE文字列関数を許可する", () => {
  assert.doesNotThrow(() => assertSafeSql(`SELECT REPLACE("name", ' ', '') FROM "input_1"`));
  assert.doesNotThrow(() => assertSafeSql(`SELECT replace /* scalar function */ ("name", 'a', 'b') FROM "input_1"`));
});

test("Supabase側は更新SQLと外部読込関数を拒否する", () => {
  assert.throws(() => assertSafeSql("WITH x AS (SELECT 1) INSERT OR REPLACE INTO target SELECT * FROM x"), /INSERT/);
  assert.throws(() => assertSafeSql("SELECT REPLACE FROM input_1"), /REPLACE/);
  assert.throws(() => assertSafeSql("SELECT * FROM read_csv_auto('https://example.com/data.csv')"), /READ_CSV_AUTO/);
});

test("Supabase側は外部読込関数と同名の列を許可する", () => {
  assert.doesNotThrow(() => assertSafeSql("SELECT read_csv FROM input_1"));
});
