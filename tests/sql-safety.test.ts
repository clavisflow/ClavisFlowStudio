import assert from "node:assert/strict";
import test from "node:test";
import { inspectSqlStructure } from "../lib/sql-safety.ts";

test("SELECT and WITH queries are accepted", () => {
  assert.equal(inspectSqlStructure("SELECT * FROM invoices").safe, true);
  assert.equal(inspectSqlStructure("WITH x AS (SELECT 1 AS n) SELECT n FROM x;").safe, true);
});

test("keywords in strings, identifiers, and comments do not cause false positives", () => {
  assert.equal(inspectSqlStructure(`SELECT 'DROP', "UPDATE" FROM invoices -- COPY`).safe, true);
});

test("multiple statements and mutations are rejected", () => {
  assert.equal(inspectSqlStructure("SELECT 1; SELECT 2").safe, false);
  assert.equal(inspectSqlStructure("WITH x AS (DELETE FROM invoices RETURNING *) SELECT * FROM x").safe, false);
  assert.equal(inspectSqlStructure("COPY (SELECT 1) TO 'x.csv'").safe, false);
});

test("external readers and malformed structures are rejected", () => {
  assert.equal(inspectSqlStructure("SELECT * FROM read_csv_auto('https://example.com/data.csv')").safe, false);
  assert.equal(inspectSqlStructure("SELECT * FROM invoices WHERE (id = 1").safe, false);
  assert.equal(inspectSqlStructure("SELECT 'unterminated").safe, false);
});
