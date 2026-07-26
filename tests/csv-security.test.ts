import assert from "node:assert/strict";
import test from "node:test";
import { neutralizeFormula, serializeSafeCsv } from "../lib/csv-security.ts";

test("spreadsheet formulas are neutralized", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "  =HYPERLINK(\"x\")"]) {
    assert.equal(neutralizeFormula(value).startsWith("'"), true);
  }
  assert.equal(neutralizeFormula("ordinary text"), "ordinary text");
});

test("CSV output quotes commas, quotes, and newlines", () => {
  assert.equal(serializeSafeCsv(["a", "b"], [{ a: "x,y", b: 'say "hi"' }]), 'a,b\r\n"x,y","say ""hi"""\r\n');
});
